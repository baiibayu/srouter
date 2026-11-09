import { getDb, getSetting, setSetting } from '../db/index.js';
import { parseRetryAfterMs } from '../providers/base.js';
import { getProvider, resolveProvider } from '../providers/index.js';
import { OpenAICompatProvider } from '../providers/openai-compat.js';
import type { Platform } from '@baiibayu/srouter-shared/types.js';
import { RetryHintTracker } from '../lib/retry-hint.js';
import { getClientContext } from '../lib/client-context.js';
import { proxyFetch } from '../lib/proxy.js';
import { secondsUntilNextMonth } from './key-budget.js';
import { reserveProviderCredential, type ReservedProviderCredential } from './provider-credential.js';
import { isOnCooldown, setCooldown } from './ratelimit.js';

// Decision models over the key pool.
//
// A decision model answers typed questions about a piece of state instead of
// generating text: pick one option (choice), yes/no (noul) or a rating on a
// rubric (score), each with probabilities and a confidence. They speak the
// "System One" request shape: { state, questions: { id: { type, instructions,
// criteria } } }.
//
// Decision models are media_models rows with modality = 'decision', maintained
// only by the catalog's `decisionModels` registry (see catalog-sync). They ride
// on keys the user already has for the hosting platform (Cloudflare Workers AI,
// OpenRouter), so there is no separate key to add. They are exposed on
// POST /v1/systemone. System One can act as the direct decider in routing.
//
// Routing within decisions: the requested model, or every enabled decision
// model in priority order for 'auto', then every healthy enabled key of that
// model's platform. A rate-limited or rejected key cools down for that model
// and the chain moves on. Every attempt is logged to decision_requests.

export const DECISION_MODALITY = 'decision';
export const SYSTEMONE_DEFAULT_SETTING = 'systemone_default_model';

const FETCH_TIMEOUT_MS = 30_000;
const RATE_LIMIT_COOLDOWN_MS = 60_000;
const BAD_KEY_COOLDOWN_MS = 60 * 60_000;
const NO_CREDIT_COOLDOWN_MS = 12 * 60 * 60_000;
const ESTIMATED_TOKENS = 500;

export const DECISION_QUESTION_TYPES = ['choice', 'noul', 'score'] as const;
export type DecisionQuestionType = (typeof DECISION_QUESTION_TYPES)[number];

export interface DecisionQuestion {
  type: DecisionQuestionType;
  instructions: unknown;
  criteria?: unknown;
}

export interface DecisionRequest {
  state: unknown;
  questions: Record<string, DecisionQuestion>;
}

export interface DecisionResponse {
  /** The decision model that answered (its catalog id). */
  model: string;
  provider: string;
  answers: Record<string, unknown>;
  usage: { input_tokens: number; output_tokens: number };
}

export class DecisionError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'DecisionError';
  }
}

export interface DecisionOptions {
  /** A decision model id, or 'auto' / undefined for the first one that works. */
  model?: string;
  signal?: AbortSignal;
  /** Overrides the request-scoped client agent (tests, internal callers). */
  clientAgent?: string | null;
}

interface DecisionModelRow {
  id: number;
  platform: string;
  model_id: string;
  display_name: string;
  priority: number;
  enabled: number;
  quota_label: string;
  meta_json: string | null;
}

interface DecisionModelMeta {
  contextWindow?: number;
  premiumSince?: string;
}

function parseMeta(raw: string | null): DecisionModelMeta {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as DecisionModelMeta;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function ensureLocalHeuristic(db: ReturnType<typeof getDb>): void {
  const hasLocal = db.prepare('SELECT 1 FROM media_models WHERE modality = ? AND platform = ? AND model_id = ?').get(DECISION_MODALITY, 'local', 'heuristic');
  if (!hasLocal) {
    try {
      db.prepare(`
        INSERT INTO media_models (platform, model_id, display_name, modality, priority, enabled, quota_label, meta_json)
        VALUES ('local', 'heuristic', 'Heuristic Decider (Local Built-in)', ?, 99, 1, 'Local classifier (0ms, free)', '{"contextWindow":131072}')
      `).run(DECISION_MODALITY);
    } catch {
      // Ignored
    }
  }
}

function allDecisionRows(): DecisionModelRow[] {
  const db = getDb();
  if (process.env.NODE_ENV !== 'test') {
    ensureLocalHeuristic(db);
  }
  return db
    .prepare(`SELECT id, platform, model_id, display_name, priority, enabled, quota_label, meta_json
                FROM media_models WHERE modality = ? ORDER BY priority, id`)
    .all(DECISION_MODALITY) as DecisionModelRow[];
}

// ── Adapters ────────────────────────────────────────────────────────────────

interface AdapterResult {
  answers: Record<string, unknown>;
  usage: { input_tokens: number; output_tokens: number };
}

type Adapter = (cred: ReservedProviderCredential, modelId: string, body: DecisionRequest, signal?: AbortSignal) => Promise<AdapterResult>;

async function upstream(url: string, platform: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
  const timeoutSignal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const res = await proxyFetch(
    url,
    { ...init, signal: signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal },
    platform,
    'decision',
    FETCH_TIMEOUT_MS,
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new DecisionError(
      `${platform} ${res.status}: ${text.slice(0, 200)}`,
      res.status,
      undefined,
      parseRetryAfterMs(res.headers?.get('retry-after') ?? null),
    );
  }
  return res.json();
}

function usageOf(raw: unknown): AdapterResult['usage'] {
  const u = (raw ?? {}) as { input_tokens?: unknown; output_tokens?: unknown };
  return {
    input_tokens: typeof u.input_tokens === 'number' ? u.input_tokens : 0,
    output_tokens: typeof u.output_tokens === 'number' ? u.output_tokens : 0,
  };
}

function answersOf(raw: unknown, platform: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new DecisionError(`${platform} returned no answers`, 502);
  }
  return raw as Record<string, unknown>;
}

/** Cloudflare Workers AI keys are stored as "account_id:api_token". */
function cloudflareKey(key: string): { accountId: string; token: string } {
  const sep = key.indexOf(':');
  if (sep === -1) throw new DecisionError('Cloudflare key must be in format "account_id:api_token"', 401);
  return { accountId: key.slice(0, sep), token: key.slice(sep + 1) };
}

function getDefaultBaseUrl(platform: string): string {
  if (platform === 'typesafe') return 'https://api.typesafe.ai';
  if (platform === 'ollama') return 'https://ollama.com';
  const provider = resolveProvider(platform as Platform);
  if (provider && provider instanceof OpenAICompatProvider && provider.baseUrlPublic) {
    return provider.baseUrlPublic;
  }
  return `https://api.${platform}.com`;
}

/** Generic System One runner (standard protocol for Ollama Cloud, TypeSafe, and custom/third-party backends) */
function genericSystemOne(platform: string): Adapter {
  return async (cred, modelId, body, signal) => {
    const rawBase = cred.baseUrl?.replace(/\/+$/, '') || getDefaultBaseUrl(platform);
    const url = rawBase.endsWith('/v1/systemone') || rawBase.endsWith('/v1/decision') ? rawBase : `${rawBase}/v1/systemone`;
    const json = (await upstream(
      url,
      platform,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cred.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: modelId, state: body.state, questions: body.questions }),
      },
      signal,
    )) as { answers?: unknown; usage?: unknown; error?: string | { message?: string } };
    const errMsg = typeof json?.error === 'string' ? json.error : json?.error?.message;
    if (errMsg) throw new DecisionError(`${platform}: ${errMsg}`, 502);
    return { answers: answersOf(json?.answers, platform), usage: usageOf(json?.usage) };
  };
}

const ADAPTERS: Record<string, Adapter> = {
  // Workers AI runs Clef through ai/run, with a short `model` selector
  // ("clef-flash") inside the body. Response: { result: { answers, usage } }.
  cloudflare: async (cred, modelId, body, signal) => {
    const { accountId, token } = cloudflareKey(cred.key);
    const selector = modelId.split('/').pop() ?? modelId;
    const json = await upstream(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${modelId}`,
      'cloudflare',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selector, state: body.state, questions: body.questions }),
      },
      signal,
    ) as { success?: boolean; result?: { answers?: unknown; usage?: unknown }; errors?: Array<{ message?: string }> };
    if (json?.success === false || !json?.result) {
      throw new DecisionError(`cloudflare: ${json?.errors?.[0]?.message ?? 'no result'}`, 502);
    }
    return { answers: answersOf(json.result.answers, 'cloudflare'), usage: usageOf(json.result.usage) };
  },
  // OpenRouter serves decision models on its alpha decisions endpoint (not
  // under /api/v1), same System One body with the full model id.
  openrouter: async (cred, modelId, body, signal) => {
    const json = await upstream(
      'https://openrouter.ai/api/alpha/decisions',
      'openrouter',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cred.key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:20268',
          'X-Title': 'SRouter',
        },
        body: JSON.stringify({ model: modelId, state: body.state, questions: body.questions }),
      },
      signal,
    ) as { answers?: unknown; usage?: unknown; error?: { message?: string } };
    if (json?.error) throw new DecisionError(`openrouter: ${json.error.message ?? 'error'}`, 502);
    return { answers: answersOf(json?.answers, 'openrouter'), usage: usageOf(json?.usage) };
  },
  typesafe: genericSystemOne('typesafe'),
  ollama: genericSystemOne('ollama'),
  'opencode-free': async (cred, modelId, body, signal) => {
    try {
      const json = await upstream(
        'https://opencode.ai/zen/v1/systemone',
        'opencode-free',
        {
          method: 'POST',
          headers: {
            Authorization: cred.key && cred.key !== 'no-key' ? `Bearer ${cred.key}` : 'Bearer public',
            'Content-Type': 'application/json',
            'User-Agent': 'opencode/latest/2.0.26/cli',
            'x-opencode-client': 'cli',
          },
          body: JSON.stringify({ model: modelId || 'jev-1.13-free', state: body.state, questions: body.questions }),
        },
        signal,
      ) as { answers?: unknown; usage?: unknown; error?: { message?: string } };
      if (!json?.error && json?.answers) {
        return { answers: answersOf(json.answers, 'opencode-free'), usage: usageOf(json.usage) };
      }
    } catch {
      // Upstream /zen/v1/systemone unavailable -> fall back directly to OpenCode Free chat decision
    }
    return executeOpenCodeChatDecision(body, signal);
  },
  'local': async (_cred, _modelId, body) => {
    const stateStr = typeof body.state === 'string' ? body.state : JSON.stringify(body.state);
    const isHard = stateStr.length > 1500 || /```|function|class|algorithm|sql/i.test(stateStr);
    const isTrivial = stateStr.length < 60 && !/```/i.test(stateStr);
    const score = isHard ? 8 : isTrivial ? 2 : 5;
    const answers: Record<string, unknown> = {};
    for (const [k, q] of Object.entries(body.questions)) {
      if (q.type === 'score') answers[k] = { score };
      else if (q.type === 'choice') answers[k] = { choice: isHard ? 'hard' : isTrivial ? 'trivial' : 'normal' };
      else if (q.type === 'noul') answers[k] = { noul: !isTrivial };
    }
    return {
      answers: answersOf(answers, 'local'),
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  },
};

export function resolveDecisionAdapter(platform: string): Adapter {
  return ADAPTERS[platform] ?? genericSystemOne(platform);
}

export function recordLocalDecisionUsage(modelId = 'heuristic', latencyMs = 0): void {
  try {
    getDb()
      .prepare(`INSERT INTO decision_requests (model_id, platform, key_id, status, latency_ms, question_count, input_tokens, client_agent, error)
                VALUES (?, 'local', NULL, 'ok', ?, 1, 0, 'internal', NULL)`)
      .run(modelId, latencyMs);
  } catch (e) {
    console.error('Failed to log local decision request:', e);
  }
}

async function executeOpenCodeChatDecision(
  body: DecisionRequest,
  signal?: AbortSignal,
): Promise<AdapterResult> {
  const provider = getProvider('opencode-free');
  if (!provider) throw new DecisionError('opencode-free provider unavailable', 502);

  const stateStr = typeof body.state === 'string' ? body.state : JSON.stringify(body.state);
  const questionsJson = JSON.stringify(body.questions, null, 2);

  const systemPrompt = `You are the System One decision judge. Evaluate the state according to each question specification.
Return ONLY a valid JSON object in this exact shape:
{
  "answers": {
    "<question_key>": { "score": <number 0..10> }
  }
}
If choice or noul question, include "choice": "<selected>" or "noul": true/false.
Do NOT include markdown fences, thoughts, or explanation. Output ONLY the raw JSON object.`;

  const userPrompt = `State:
${stateStr.slice(0, 4000)}

Questions:
${questionsJson}`;

  const res = await provider.chatCompletion(
    'public',
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    'mimo-v2.6-flash-free',
    { temperature: 0.1, signal, timeoutMs: 8000 },
  );

  const rawContent = res.choices?.[0]?.message?.content ?? '';
  const content = typeof rawContent === 'string' ? rawContent : Array.isArray(rawContent) ? rawContent.map((c: any) => c.text ?? '').join('') : '';
  let clean = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  clean = clean.replace(/```(?:json)?\s*/gi, '').replace(/\s*```/g, '').trim();

  let parsed: any;
  try {
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(clean);
  } catch {
    throw new DecisionError('Failed to parse decision JSON from opencode-free', 502);
  }

  let answers: Record<string, unknown> = {};
  if (parsed && typeof parsed === 'object') {
    if (parsed.answers && typeof parsed.answers === 'object') {
      answers = parsed.answers as Record<string, unknown>;
    } else {
      for (const [qKey, qDef] of Object.entries(body.questions)) {
        if (parsed[qKey] !== undefined) {
          answers[qKey] = typeof parsed[qKey] === 'object' ? parsed[qKey] : { score: parsed[qKey] };
        } else if (qDef.type === 'score') {
          const scoreVal = parsed.score ?? parsed.complexity_score ?? parsed[`${qKey}_score`] ?? 5;
          answers[qKey] = { score: typeof scoreVal === 'number' ? scoreVal : Number(scoreVal) || 5 };
        } else if (qDef.type === 'choice') {
          const choiceVal = parsed.choice ?? parsed.answer ?? parsed[qKey];
          answers[qKey] = { choice: String(choiceVal ?? '') };
        } else if (qDef.type === 'noul') {
          const noulVal = parsed.noul ?? parsed.answer;
          answers[qKey] = { noul: Boolean(noulVal) };
        }
      }
    }
  }

  return {
    answers: answersOf(answers, 'opencode-free'),
    usage: {
      input_tokens: res.usage?.prompt_tokens ?? 200,
      output_tokens: res.usage?.completion_tokens ?? 50,
    },
  };
}

/** Platforms with a decision adapter. catalog-sync gates decisionModels rows
 *  on this, the way SEARCH_ENGINE_PLATFORMS gates search rows. */
export const DECISION_PLATFORMS = new Set(Object.keys(ADAPTERS).filter(p => p !== 'local'));

// ── Routing ─────────────────────────────────────────────────────────────────

function logDecision(row: DecisionModelRow, keyId: number | null, status: 'ok' | 'error', latencyMs: number, questionCount: number, inputTokens: number, clientAgent: string | null, error: string | null): void {
  try {
    getDb()
      .prepare(`INSERT INTO decision_requests (model_id, platform, key_id, status, latency_ms, question_count, input_tokens, client_agent, error)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(row.model_id, row.platform, keyId, status, latencyMs, questionCount, inputTokens, clientAgent, error);
  } catch (e) {
    console.error('Failed to log decision request:', e);
  }
}

function coolDown(row: DecisionModelRow, keyId: number, e: DecisionError): void {
  if (e.status === 401 || e.status === 403) {
    setCooldown(row.platform, row.model_id, keyId, BAD_KEY_COOLDOWN_MS);
  } else if (e.status === 402) {
    setCooldown(row.platform, row.model_id, keyId, NO_CREDIT_COOLDOWN_MS, 'credit');
  } else if (e.status === 429) {
    setCooldown(row.platform, row.model_id, keyId, e.retryAfterMs ?? RATE_LIMIT_COOLDOWN_MS);
  }
}

function hasUsableKey(platform: string): boolean {
  if (platform === 'local') return true;
  return !!getDb()
    .prepare("SELECT 1 FROM api_keys WHERE platform = ? AND enabled = 1 AND status IN ('healthy', 'unknown') LIMIT 1")
    .get(platform);
}

/** True when at least one enabled decision model has a usable key. */
export function decisionsAvailable(): boolean {
  return allDecisionRows().some(r => r.enabled === 1 && resolveDecisionAdapter(r.platform) && hasUsableKey(r.platform));
}

function decisionChain(model: string | undefined): DecisionModelRow[] {
  const enabled = allDecisionRows().filter(r => r.enabled === 1 && resolveDecisionAdapter(r.platform));
  if (!model || model === 'auto') {
    const defaultModelId = getSetting(SYSTEMONE_DEFAULT_SETTING) ?? null;
    if (defaultModelId) {
      const defaultIdx = enabled.findIndex(r => r.model_id === defaultModelId);
      if (defaultIdx > 0) {
        const [def] = enabled.splice(defaultIdx, 1);
        enabled.unshift(def);
      }
    }
    return enabled;
  }
  const pinned = enabled.filter(r => r.model_id === model);
  if (pinned.length === 0) {
    const known = allDecisionRows().some(r => r.model_id === model);
    throw new DecisionError(
      known
        ? `Decision model '${model}' is turned off. Turn it on from Models → Decision, or use 'auto'.`
        : `Unknown System One model '${model}'. Use 'auto' or a model id from GET /v1/systemone/models.`,
      400,
    );
  }
  return pinned;
}

export async function runDecision(body: DecisionRequest, opts: DecisionOptions = {}): Promise<DecisionResponse> {
  const chain = decisionChain(opts.model);
  const clientAgent = opts.clientAgent !== undefined ? opts.clientAgent : getClientContext().agent;
  const questionCount = Object.keys(body.questions).length;

  let lastError: DecisionError | null = null;
  let attempted = 0;
  const hints = new RetryHintTracker();
  for (const row of chain) {
    const tried = new Set<number>();
    for (;;) {
      if (opts.signal?.aborted) throw new DecisionError('decision cancelled by the client', 499);
      const { credential, budgetBlocked } = reserveProviderCredential(
        { platform: row.platform, key_id: null },
        ESTIMATED_TOKENS,
        keyId => tried.has(keyId) || isOnCooldown(row.platform, row.model_id, keyId),
      );
      if (!credential) {
        if (budgetBlocked) {
          lastError = new DecisionError('Monthly key budget exhausted', 429, 'quota_exceeded');
          hints.record(429, secondsUntilNextMonth() * 1000);
        }
        break;
      }
      tried.add(credential.id);
      attempted++;
      const started = Date.now();
      try {
        const adapter = resolveDecisionAdapter(row.platform);
        const out = await adapter(credential, row.model_id, body, opts.signal);
        logDecision(row, credential.id, 'ok', Date.now() - started, questionCount, out.usage.input_tokens, clientAgent, null);
        return { model: row.model_id, provider: row.platform, answers: out.answers, usage: out.usage };
      } catch (err: any) {
        const e = err instanceof DecisionError ? err : new DecisionError(String(err?.message ?? err), 502);
        logDecision(row, credential.id, 'error', Date.now() - started, questionCount, 0, clientAgent, e.message.slice(0, 300));
        coolDown(row, credential.id, e);
        lastError = e;
        hints.record(e.status, e.retryAfterMs);
        if (opts.signal?.aborted) throw new DecisionError('decision cancelled by the client', 499);
        // A malformed request is the caller's problem, not this key's: move to
        // the next model rather than burning every key on it.
        if (e.status === 400 || e.status === 422) break;
      } finally {
        credential.release();
      }
    }
  }

  if (attempted === 0 && !lastError) {
    if (decisionsAvailable()) {
      throw new DecisionError(
        'Every decision key is cooling down (rate limited or rejected). Try again later.',
        429,
        'decision_keys_cooling_down',
      );
    }
    throw new DecisionError(
      'No decision model is available. Add a Cloudflare or OpenRouter key on the Keys page.',
      503,
      'no_decision_keys',
    );
  }
  // Only statuses the caller can act on pass through: an upstream 401 means
  // OUR provider key failed, not the caller's. A 400 from every model is most
  // likely a malformed request, so it is passed through as one.
  const status = lastError?.status === 429 ? 429 : lastError?.status === 400 || lastError?.status === 422 ? 400 : 502;
  throw new DecisionError(
    `All decision models failed${lastError ? ` (last: ${lastError.message.slice(0, 160)})` : ' (no usable keys)'}.`,
    status,
    lastError?.code,
    status === 429 ? hints.retryAfterMs() : undefined,
  );
}

export function decisionRetryAfterSec(err: DecisionError): number | undefined {
  if (err.retryAfterMs !== undefined) return Math.ceil(err.retryAfterMs / 1000);
  if (err.code === 'quota_exceeded') return secondsUntilNextMonth();
  return undefined;
}

// ── Dashboard ───────────────────────────────────────────────────────────────

export interface DecisionModelView {
  id: number;
  platform: string;
  modelId: string;
  displayName: string;
  priority: number;
  enabled: boolean;
  isDefault: boolean;
  quotaLabel: string;
  contextWindow: number | null;
  keyCount: number;
  healthyKeyCount: number;
  decisionsThisMonth: number;
}

export function listDecisionModels(): DecisionModelView[] {
  const db = getDb();
  const platforms = [...DECISION_PLATFORMS];
  const keyRows = db.prepare(`
    SELECT platform, enabled, status FROM api_keys
     WHERE platform IN (${platforms.map(() => '?').join(', ')})
  `).all(...platforms) as { platform: string; enabled: number; status: string }[];
  const healthy = (k: { enabled: number; status: string }) => k.enabled === 1 && (k.status === 'healthy' || k.status === 'unknown');
  const monthCounts = new Map(
    (db.prepare(`
      SELECT platform, model_id, COUNT(*) AS n FROM decision_requests
       WHERE status = 'ok' AND created_at >= datetime('now', 'start of month')
       GROUP BY platform, model_id
    `).all() as { platform: string; model_id: string; n: number }[]).map(r => [`${r.platform}:${r.model_id}`, r.n]),
  );
  const defaultModelId = getSetting(SYSTEMONE_DEFAULT_SETTING) ?? null;
  return allDecisionRows().map(row => {
    const meta = parseMeta(row.meta_json);
    const keys = keyRows.filter(k => k.platform === row.platform);
    const isLocal = row.platform === 'local';
    return {
      id: row.id,
      platform: row.platform,
      modelId: row.model_id,
      displayName: row.display_name,
      priority: row.priority,
      enabled: row.enabled === 1,
      isDefault: row.model_id === defaultModelId,
      quotaLabel: row.quota_label,
      contextWindow: typeof meta.contextWindow === 'number' ? meta.contextWindow : null,
      keyCount: isLocal ? 1 : keys.length,
      healthyKeyCount: isLocal ? 1 : keys.filter(healthy).length,
      decisionsThisMonth: monthCounts.get(`${row.platform}:${row.model_id}`) ?? 0,
    };
  });
}

/** Turn a decision model on or off. False when the id is not a decision model. */
export function setDecisionModelEnabled(id: number, enabled: boolean): boolean {
  const info = getDb()
    .prepare('UPDATE media_models SET enabled = ? WHERE id = ? AND modality = ?')
    .run(enabled ? 1 : 0, id, DECISION_MODALITY);
  return info.changes > 0;
}

/** Returns the model_id of the user-chosen default decision model, or null. */
export function getDecisionDefaultModelId(): string | null {
  return getSetting(SYSTEMONE_DEFAULT_SETTING) ?? null;
}

/**
 * Set model `id` as the default decision model (tried first in auto mode).
 * Returns false if the id is not a decision model row.
 */
export function setDecisionModelDefault(id: number): boolean {
  const row = getDb()
    .prepare('SELECT model_id FROM media_models WHERE id = ? AND modality = ?')
    .get(id, DECISION_MODALITY) as { model_id: string } | undefined;
  if (!row) return false;
  setSetting(SYSTEMONE_DEFAULT_SETTING, row.model_id);
  return true;
}

export function decisionAnalytics(): { total: number; today: number } {
  const db = getDb();
  const total = (db.prepare(`
    SELECT COUNT(*) AS n FROM decision_requests
     WHERE status = 'ok' AND created_at >= datetime('now', 'start of month')
  `).get() as { n: number }).n;
  const today = (db.prepare(`
    SELECT COUNT(*) AS n FROM decision_requests
     WHERE status = 'ok' AND created_at >= datetime('now', 'start of day')
  `).get() as { n: number }).n;
  return { total, today };
}
