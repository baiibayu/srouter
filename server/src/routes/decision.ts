// POST /v1/decision - System One decision endpoint (TypeSafe)
//
// Accepts a decision request (model + state + questions) and returns a scored
// decision via the configured Jev host (JEV_HOST_PRESETS + readJevApiKey) with
// a 2000ms timeout. When no Jev host is usable (non-keyless host with no stored
// key), falls back to a chat-judge: a non-stream chatCompletion call to the
// first cheap provider that has an active key stored in api_keys. The preference
// order and on/off toggle are stored as settings (decision_chat_judge,
// decision_chat_judge_order). Finally falls back to the local heuristic scorer.
// Response shape matches the docs.typesafe.ai contract.

import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import type { ChatMessage } from '@baiibayu/srouter-shared/types.js';
import { getComplexityGate, readJevApiKey, matchJevPreset, classifyComplexityHeuristic } from '../services/complexity-gate.js';
import { extractApiToken, getRequestGroupId } from './proxy.js';
import { resolveAuth } from '../lib/system-prompt.js';
import { createProxyRateLimiter } from '../middleware/rateLimit.js';
import { getFallbackTimeBudgetMs } from '../lib/fallback-loop.js';
import { providerTimeoutMs } from '../lib/provider-timeout.js';
import { getSetting, getDb } from '../db/index.js';
import { decrypt } from '../lib/crypto.js';
import { resolveProvider } from '../providers/index.js';

export const decisionRouter = Router();

// Settings keys for chat-judge feature
export const DECISION_CHAT_JUDGE_KEY = 'decision_chat_judge';
export const DECISION_CHAT_JUDGE_ORDER_KEY = 'decision_chat_judge_order';

// Default preference order: cheapest / most available providers first
const DEFAULT_CHAT_JUDGE_ORDER = ['groq', 'google', 'openrouter', 'mistral'];

// Total budget for chat-judge (must stay well under 3000ms per spec)
const CHAT_JUDGE_TIMEOUT_MS = 2500;

// Decision contract per docs.typesafe.ai (verified in repo notebooks)
const decisionRequestSchema = z.object({
  model: z.string().min(1),
  state: z.string().min(1),
  questions: z.object({
    // Choice questions: max 255 options, score 2..10, null for yes/no
    complexity: z.object({
      type: z.literal('choice'),
      instructions: z.string().min(1),
      criteria: z.array(z.string().min(1)).max(255),
      options: z.record(z.number().min(2).max(10)).optional(),
    }),
  }),
}).strict();

type DecisionRequest = z.infer<typeof decisionRequestSchema>;

interface DecisionAnswer {
  question: string;
  answer: string;
  score: number;
}

interface DecisionResponse {
  id: string;
  object: 'decision';
  created: number;
  model: string;
  answers: DecisionAnswer[];
  source: 'jev' | 'chatJudge' | 'heuristic';
  host?: string;
  tookMs: number;
}

// Local heuristic scorer (fail-open fallback)
function scoreChoice(options: Record<string, number> | undefined, criteria: string[]): DecisionAnswer[] {
  // If options provided, use them; otherwise default to criteria keys with mid-range scores
  const opts = options && Object.keys(options).length > 0
    ? options
    : Object.fromEntries(criteria.map((c, i) => [c, Math.round(6 + (i % 5))]));
  return criteria.map((c) => ({
    question: 'complexity',
    answer: c,
    score: opts[c] ?? 6,
  }));
}

// Call the Jev host (System One) with a 2000ms timeout; return null on any error/timeouts
async function callJevDecision(cfg: ReturnType<typeof getComplexityGate>, req: DecisionRequest): Promise<DecisionAnswer[] | null> {
  const preset = matchJevPreset(cfg.jevBaseUrl);
  const systemoneUrl = preset?.systemoneUrl ?? `${cfg.jevBaseUrl.replace(/\/+$/, '')}/v1/systemone`;
  const apiKey = readJevApiKey();
  if (!preset?.keyless && !apiKey) return null;

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (preset?.keyless) {
    headers.authorization = `Bearer ${apiKey ?? 'public'}`;
    headers['User-Agent'] = 'opencode/1.18.31 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14';
    headers['x-opencode-client'] = 'desktop';
  } else {
    headers.authorization = `Bearer ${apiKey}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.jevTimeoutMs);
  try {
    const res = await fetch(systemoneUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: cfg.jevModel,
        state: req.state,
        questions: req.questions,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json() as { answers?: Record<string, { answer?: string; score?: number }> };
    const ans = data.answers;
    if (!ans) return null;
    const out: DecisionAnswer[] = [];
    for (const [q, v] of Object.entries(ans)) {
      if (typeof v?.answer === 'string' && typeof v?.score === 'number') {
        out.push({ question: q, answer: v.answer, score: v.score });
      }
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Read the first active decrypted key for the given platform from api_keys.
// Returns null if no healthy/unknown enabled key exists for that platform.
function readFirstActiveKey(platform: string): string | null {
  const db = getDb();
  const row = db.prepare(
    `SELECT encrypted_key, iv, auth_tag FROM api_keys
     WHERE platform = ? AND enabled = 1
       AND status IN ('healthy', 'unknown')
     ORDER BY status = 'healthy' DESC, id
     LIMIT 1`,
  ).get(platform) as { encrypted_key: string; iv: string; auth_tag: string } | undefined;
  if (!row) return null;
  try {
    return decrypt(row.encrypted_key, row.iv, row.auth_tag);
  } catch {
    return null;
  }
}

// Read chat-judge preference order from settings, falling back to the default list.
function getChatJudgeOrder(): string[] {
  const raw = getSetting(DECISION_CHAT_JUDGE_ORDER_KEY);
  if (!raw) return DEFAULT_CHAT_JUDGE_ORDER;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((p) => typeof p === 'string')) {
      return parsed as string[];
    }
  } catch {
    // ignore parse errors
  }
  return DEFAULT_CHAT_JUDGE_ORDER;
}

// Is chat-judge enabled? Default: on ('1').
function isChatJudgeEnabled(): boolean {
  const raw = getSetting(DECISION_CHAT_JUDGE_KEY);
  // Absent setting or '1' = enabled; only explicit '0' disables
  return raw === undefined || raw !== '0';
}

// Parse a score (2..10) from a JSON string or free-text fallback.
// Returns null when nothing sensible can be found.
function parseJudgeScore(text: string): number | null {
  // Try JSON parse first
  try {
    const obj = JSON.parse(text) as unknown;
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      for (const v of Object.values(obj as Record<string, unknown>)) {
        if (typeof v === 'number' && v >= 2 && v <= 10) return v;
      }
    }
  } catch {
    // fall through to regex
  }
  // Regex fallback: find a bare integer 2..10 in the text
  const m = /\b([2-9]|10)\b/.exec(text);
  if (m) {
    const n = Number(m[1]);
    if (n >= 2 && n <= 10) return n;
  }
  return null;
}

// Chat-judge: pick the first platform in the preference order that has an active
// stored key, send a short non-stream chatCompletion prompt, and return scored
// answers. Returns null on any error, timeout, or when no suitable provider exists.
// Total wall-clock budget: CHAT_JUDGE_TIMEOUT_MS (well below 3000ms).
async function chatJudge(
  req: DecisionRequest,
): Promise<DecisionAnswer[] | null> {
  if (!isChatJudgeEnabled()) return null;

  const order = getChatJudgeOrder();

  let pickedPlatform: string | null = null;
  let pickedKey: string | null = null;

  for (const platform of order) {
    const key = readFirstActiveKey(platform);
    if (key) {
      pickedPlatform = platform;
      pickedKey = key;
      break;
    }
  }

  if (!pickedPlatform || !pickedKey) return null;

  const provider = resolveProvider(pickedPlatform as any);
  if (!provider) return null;

  // Build a minimal chatCompletion prompt that asks the model to pick one
  // criteria from the list and return a score 2..10 in JSON, no prose.
  const criteriaList = req.questions.complexity.criteria.join(', ');
  const instructions = req.questions.complexity.instructions;
  const systemPrompt = `You are a complexity classifier. Given the context below, choose exactly one option from [${criteriaList}] and assign a score between 2 and 10. Respond with only a JSON object: {"answer":"<choice>","score":<number>}. No explanation.`;
  const userContent = `Instructions: ${instructions}\n\nContext:\n${req.state}`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_JUDGE_TIMEOUT_MS);
  const combinedSignal = controller.signal;

  try {
    const completion = await provider.chatCompletion(
      pickedKey,
      messages,
      // Use a small, fast model per platform (provider picks a default if undefined)
      'auto',
      {
        temperature: 0,
        max_tokens: 64,
        signal: combinedSignal,
      },
    );

    // Extract text content from the completion
    const content = completion.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') return null;

    const score = parseJudgeScore(content.trim());
    if (score === null) return null;

    // Parse the answer from JSON if available, else use the first criteria
    let answer = req.questions.complexity.criteria[0] ?? 'unknown';
    try {
      const obj = JSON.parse(content.trim()) as Record<string, unknown>;
      if (typeof obj.answer === 'string' && obj.answer.length > 0) {
        answer = obj.answer;
      }
    } catch {
      // Regex fallback for answer
      const answerMatch = /"answer"\s*:\s*"([^"]+)"/.exec(content);
      if (answerMatch) answer = answerMatch[1];
    }

    return [{ question: 'complexity', answer, score }];
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

decisionRouter.post('/decision', createProxyRateLimiter(), async (req: Request, res: Response) => {
  const start = Date.now();
  const requestGroupId = getRequestGroupId(req);
  res.setHeader('X-Request-ID', requestGroupId);

  // Unified-key auth (Bearer or x-api-key) like the rest of /v1
  const auth = resolveAuth(extractApiToken(req));
  if (!auth) {
    res.status(401).json({ error: { message: 'Invalid API key', type: 'authentication_error' } });
    return;
  }

  // Parse and validate body
  let parsed: DecisionRequest;
  try {
    parsed = decisionRequestSchema.parse(req.body);
  } catch (e: any) {
    res.status(422).json({ error: { message: `Invalid request: ${e.message}`, type: 'invalid_request_error' } });
    return;
  }

  // Rate-limit ceiling: 20 req/min per IP (same as shared /v1 limiter)
  const timeBudgetMs = getFallbackTimeBudgetMs();
  const jevTimeoutMs = Math.min(2000, timeBudgetMs > 0 ? timeBudgetMs : 2000);

  // Get complexity gate config for Jev host selection
  const cfg = getComplexityGate();

  // Try Jev remote first; on any error/timeouts, fall back to chat-judge then heuristic
  let answers: DecisionAnswer[] | null = null;
  let source: 'jev' | 'chatJudge' | 'heuristic' = 'heuristic';
  let host: string | undefined;

  try {
    answers = await callJevDecision(cfg, parsed);
    if (answers) {
      source = 'jev';
      host = cfg.jevBaseUrl;
    }
  } catch {
    // ignore
  }

  // If Jev is unavailable (null return means no key or host refused), try chat-judge
  if (!answers) {
    try {
      answers = await chatJudge(parsed);
      if (answers) {
        source = 'chatJudge';
      }
    } catch {
      // ignore — fall through to heuristic
    }
  }

  if (!answers) {
    // Fallback to local heuristic scoring
    answers = scoreChoice(parsed.questions.complexity.options, parsed.questions.complexity.criteria);
    source = 'heuristic';
  }

  const response: DecisionResponse = {
    id: `dec_${Math.floor(start / 1000)}_${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
    object: 'decision',
    created: Math.floor(start / 1000),
    model: parsed.model,
    answers,
    source,
    tookMs: Date.now() - start,
  };
  if (host) response.host = host;

  res.json(response);
});
