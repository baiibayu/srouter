// Complexity gate — "Jev-B" (opt-in, fail-open).
//
// Classifies each chat request as trivial | normal | hard and feeds that level
// into the bandit as a SOFT weight bias (prefer fast/cheap models for trivial
// prompts, smart models for hard ones). Capability gates and the fallback
// chain are untouched; `undefined` means "leave the preset weights alone".
//
// Backend layers (pluggable, per the 2026-10-05 decision):
//   1. Jev (TypeSafe System One, optional) — typed score question over the
//      prompt, inside a timeout budget, any error/timeout falls through layer 2.
//      Host presets: OpenCode Zen keyless (default, free jev-1.13-free via the
//      same identity as opencode-free), OpenRouter (typesafe/jev-1.13, key from
//      the linked provider), TypeSafe, v1m, system-one.dev, jev-ai.pro
//      (those need a stored key) or a custom base URL.
//   1b. Local decision (optional) — the SAME System One wire format, answered
//      in-process by the decision models on the operator's own keys (Models →
//      Decision: Clef Flash, Mercury Decide — free tier). No host to
//      configure; same timeout budget; same fail-open to the heuristic.
//   2. Heuristic local (the permanent backend) — bounded reads of the prompt
//      text: length, fenced code blocks, image parts, tools. Microseconds,
//      zero network, zero RAM/model cost, never throws.
//
// Master switch is OPT-IN (disabled by default): absent a signal the routing
// preset stands, exactly like the task-type bias (#1127).

import { getSetting, setSetting, getDb } from '../db/index.js';
import type { ChatMessage } from '@baiibayu/srouter-shared/types.js';
import { contentToString } from '../lib/content.js';
import { decrypt } from '../lib/crypto.js';
import { runDecision, decisionsAvailable } from './decision.js';
import { getRoutingStrategy } from './router.js';

export type ComplexityLevel = 'trivial' | 'normal' | 'hard';

export interface ComplexityGateConfig {
  enabled: boolean;
  backend: 'heuristic' | 'jev' | 'decision';
  jevBaseUrl: string;
  jevModel: string;
  jevHostPreset: string;
  jevKeyless: boolean;
  jevTimeoutMs: number;
  /** A usable key exists — stored manually or borrowed from a linked provider. */
  hasJevApiKey: boolean;
  /** True only when a manual override is stored (borrowed keys are not copied). */
  jevKeyStored: boolean;
  /** Preset ids backed by a linked api_keys row (platform or base_url match). */
  detectedHosts: string[];
}

export const COMPLEXITY_GATE_ENABLED_KEY = 'complexity_gate_enabled';
export const COMPLEXITY_GATE_BACKEND_KEY = 'complexity_gate_backend';
export const COMPLEXITY_GATE_JEV_BASE_KEY = 'complexity_gate_jev_base_url';
export const COMPLEXITY_GATE_JEV_KEY_KEY = 'complexity_gate_jev_api_key';
export const COMPLEXITY_GATE_JEV_MODEL_KEY = 'complexity_gate_jev_model';
export const COMPLEXITY_GATE_JEV_TIMEOUT_KEY = 'complexity_gate_jev_timeout_ms';

// Zen answers in ~700-1500ms; the old 400ms budget would always abort, so the
// default budget now fits the default (keyless zen) host. Still bounded and
// configurable — a timeout just falls back to the heuristic.
export const DEFAULT_JEV_BASE_URL = 'https://openrouter.ai';
export const DEFAULT_JEV_TIMEOUT_MS = 2000;
const DEFAULT_JEV_MODEL = 'jev-latest';
const VALID_BACKENDS = ['heuristic', 'jev', 'decision'] as const;

// -- Host presets -------------------------------------------------------------
//
// `systemoneUrl` is the full endpoint (some hosts differ: jev-ai.pro lives
// under /api/v1). Hosts borrow keys from linked provider entries or use stored keys.
export interface JevHostPreset {
  id: string;
  baseUrl: string;
  systemoneUrl: string;
  model: string;
  keyless: boolean;
  /** api_keys.platform this host can borrow its key from (auto-detection). */
  provider?: string;
}

export const JEV_HOST_PRESETS: JevHostPreset[] = [
  {
    // Verified live 2026-10-10: HTTP 200, typesafe/jev-1.13-20260917, tiny cost.
    id: 'openrouter',
    baseUrl: 'https://openrouter.ai',
    systemoneUrl: 'https://openrouter.ai/api/v1/systemone',
    model: 'typesafe/jev-1.13',
    keyless: false,
    provider: 'openrouter',
  },
  {
    id: 'typesafe',
    baseUrl: 'https://api.typesafe.ai',
    systemoneUrl: 'https://api.typesafe.ai/v1/systemone',
    model: 'jev-latest',
    keyless: false,
    provider: 'typesafe',
  },
  {
    id: 'v1m',
    baseUrl: 'https://v1m.ir',
    systemoneUrl: 'https://v1m.ir/v1/systemone',
    model: 'rev-latest',
    keyless: false,
  },
  {
    id: 'system-one-dev',
    baseUrl: 'https://system-one.dev',
    systemoneUrl: 'https://system-one.dev/v1/systemone',
    model: 'jev-latest',
    keyless: false,
  },
  {
    id: 'jev-ai',
    baseUrl: 'https://jev-ai.pro',
    systemoneUrl: 'https://jev-ai.pro/api/v1/systemone',
    model: 'jev-latest',
    keyless: false,
  },
];

export function matchJevPreset(baseUrl: string): JevHostPreset | null {
  const norm = baseUrl.trim().replace(/\/+$/, '');
  return JEV_HOST_PRESETS.find((p) => p.baseUrl === norm) ?? null;
}

// -- Provider auto-detection -------------------------------------------------
//
// A linked api_keys row (matched by platform, or by base_url origin for hosts
// without a dedicated platform) means that preset is ready to use: the UI
// shows a "detected" badge and the scorer BORROWS the key at call time —
// no manual pasting, no copy stored in settings. Keyless zen is excluded on
// purpose: it never needs a link, the badge would add noise.
interface LinkedKeyRow {
  encrypted_key: string;
  iv: string;
  auth_tag: string;
}

function linkedKeyRowFor(preset: JevHostPreset): LinkedKeyRow | null {
  const db = getDb();
  if (preset.provider) {
    const byPlatform = db
      .prepare(
        "SELECT encrypted_key, iv, auth_tag FROM api_keys WHERE platform = ? AND enabled = 1 ORDER BY status = 'healthy' DESC, id LIMIT 1",
      )
      .get(preset.provider) as LinkedKeyRow | undefined;
    if (byPlatform) return byPlatform;
  }
  const rows = db
    .prepare('SELECT base_url, encrypted_key, iv, auth_tag FROM api_keys WHERE enabled = 1 AND base_url IS NOT NULL')
    .all() as Array<LinkedKeyRow & { base_url: string }>;
  const match = rows.find((r) => {
    try {
      return new URL(r.base_url).origin === new URL(preset.baseUrl).origin;
    } catch {
      return false;
    }
  });
  return match ?? null;
}

export function detectJevHosts(): string[] {
  return JEV_HOST_PRESETS.filter((p) => !p.keyless && linkedKeyRowFor(p) !== null).map((p) => p.id);
}

function readStoredJevApiKey(): string | null {
  const raw = getSetting(COMPLEXITY_GATE_JEV_KEY_KEY);
  return raw === undefined || raw.trim() === '' ? null : raw;
}

// Key resolution for scoring: a stored manual override wins; otherwise a
// detected host BORROWS its linked provider key at call time (decrypted
// server-side only — nothing is copied or persisted). Null = no key.
export function readJevApiKey(): string | null {
  const stored = readStoredJevApiKey();
  if (stored !== null) return stored;
  const baseRaw = getSetting(COMPLEXITY_GATE_JEV_BASE_KEY);
  const baseUrl = baseRaw && baseRaw.trim() !== '' ? baseRaw.trim() : DEFAULT_JEV_BASE_URL;
  const preset = matchJevPreset(baseUrl);
  if (!preset) return null;
  const row = linkedKeyRowFor(preset);
  if (!row) return null;
  return decrypt(row.encrypted_key, row.iv, row.auth_tag).trim();
}

// Stored override wins; otherwise the preset's model (custom hosts fall back
// to jev-latest). Always resolved, never null — the UI shows the real model.
function resolveJevModel(baseUrl: string): string {
  const stored = getSetting(COMPLEXITY_GATE_JEV_MODEL_KEY);
  if (stored !== undefined && stored.trim() !== '') return stored.trim();
  return matchJevPreset(baseUrl)?.model ?? DEFAULT_JEV_MODEL;
}

export function getComplexityGate(): ComplexityGateConfig {
  const backendRaw = getSetting(COMPLEXITY_GATE_BACKEND_KEY);
  const timeoutRaw = Number(getSetting(COMPLEXITY_GATE_JEV_TIMEOUT_KEY));
  const baseRaw = getSetting(COMPLEXITY_GATE_JEV_BASE_KEY);
  const jevBaseUrl = baseRaw && baseRaw.trim() !== '' ? baseRaw.trim() : DEFAULT_JEV_BASE_URL;
  const preset = matchJevPreset(jevBaseUrl);
  return {
    enabled: getSetting(COMPLEXITY_GATE_ENABLED_KEY) === '1',
    backend: backendRaw && (VALID_BACKENDS as readonly string[]).includes(backendRaw)
      ? backendRaw as 'heuristic' | 'jev' | 'decision'
      : 'heuristic',
    jevBaseUrl,
    jevModel: resolveJevModel(jevBaseUrl),
    jevHostPreset: preset?.id ?? 'custom',
    jevKeyless: preset?.keyless ?? false,
    jevTimeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw >= 50 && timeoutRaw <= 5000
      ? timeoutRaw
      : DEFAULT_JEV_TIMEOUT_MS,
    hasJevApiKey: readJevApiKey() !== null,
    jevKeyStored: readStoredJevApiKey() !== null,
    detectedHosts: detectJevHosts(),
  };
}

export interface ComplexityGatePatch {
  enabled?: boolean;
  backend?: 'heuristic' | 'jev' | 'decision';
  jevBaseUrl?: string | null;
  jevApiKey?: string | null;
  jevModel?: string | null;
  jevTimeoutMs?: number;
}

// Partial update; `jevApiKey: null` clears the stored key, a string sets it.
// Rejects unknown backends and out-of-range timeouts (callers surface 400).
export function setComplexityGate(patch: ComplexityGatePatch): void {
  if (patch.enabled !== undefined) {
    setSetting(COMPLEXITY_GATE_ENABLED_KEY, patch.enabled ? '1' : '0');
  }
  if (patch.backend !== undefined) {
    if (!(VALID_BACKENDS as readonly string[]).includes(patch.backend)) {
      throw new Error(`Unknown complexity gate backend: ${patch.backend}`);
    }
    setSetting(COMPLEXITY_GATE_BACKEND_KEY, patch.backend);
  }
  if (patch.jevBaseUrl !== undefined) {
    if (patch.jevBaseUrl === null || patch.jevBaseUrl.trim() === '') {
      getDb().prepare('DELETE FROM settings WHERE key = ?').run(COMPLEXITY_GATE_JEV_BASE_KEY);
    } else {
      setSetting(COMPLEXITY_GATE_JEV_BASE_KEY, patch.jevBaseUrl.trim());
    }
  }
  if (patch.jevApiKey !== undefined) {
    if (patch.jevApiKey === null || patch.jevApiKey.trim() === '') {
      getDb().prepare('DELETE FROM settings WHERE key = ?').run(COMPLEXITY_GATE_JEV_KEY_KEY);
    } else {
      setSetting(COMPLEXITY_GATE_JEV_KEY_KEY, patch.jevApiKey.trim());
    }
  }
  if (patch.jevModel !== undefined) {
    if (patch.jevModel === null || patch.jevModel.trim() === '') {
      // Clearing the override returns control to the preset default.
      getDb().prepare('DELETE FROM settings WHERE key = ?').run(COMPLEXITY_GATE_JEV_MODEL_KEY);
    } else {
      setSetting(COMPLEXITY_GATE_JEV_MODEL_KEY, patch.jevModel.trim());
    }
  }
  if (patch.jevTimeoutMs !== undefined) {
    if (!Number.isFinite(patch.jevTimeoutMs) || patch.jevTimeoutMs < 50 || patch.jevTimeoutMs > 5000) {
      throw new Error(`Invalid jevTimeoutMs ${patch.jevTimeoutMs} (must be 50..5000)`);
    }
    setSetting(COMPLEXITY_GATE_JEV_TIMEOUT_KEY, String(Math.floor(patch.jevTimeoutMs)));
  }
}

// Bounded scans so a huge message never costs the classifier a full read
// (same reasoning as task-type.ts MAX_SCAN_CHARS).
const MAX_SCAN_CHARS = 4000;
const TRIVIAL_MAX_CHARS = 300;
const HARD_MIN_CHARS = 4000;
// A fenced block emits two ``` markers; four = two or more blocks.
const HARD_MIN_FENCES = 4;

interface PromptShape {
  totalChars: number;
  fences: number;
  hasImage: boolean;
  hasTools: boolean;
}

function shapeOf(messages: ChatMessage[] | undefined, tools: unknown[] | undefined): PromptShape {
  let totalChars = 0;
  let fences = 0;
  let hasImage = false;
  const list = messages ?? [];
  for (const msg of list) {
    const text = contentToString(msg.content);
    if (text) {
      totalChars += text.length;
      if (fences < HARD_MIN_FENCES) {
        fences += (text.slice(0, MAX_SCAN_CHARS).match(/```/g) ?? []).length;
      }
    }
    if (!hasImage && JSON.stringify(msg.content).includes('image_url')) hasImage = true;
  }
  const hasTools = Boolean(tools && tools.length > 0);
  return { totalChars, fences, hasImage, hasTools };
}

/**
 * The permanent backend: bounded, deterministic, never throws. Mirrors the
 * 2026-10-05 agreement — "backend selamanya = heuristic lokal".
 */
export function classifyComplexityHeuristic(
  messages: ChatMessage[] | undefined,
  tools: unknown[] | undefined,
): ComplexityLevel {
  // No messages at all = no signal worth biasing for (matches `undefined`).
  if (!messages || messages.length === 0) return 'normal';
  const { totalChars, fences, hasImage, hasTools } = shapeOf(messages, tools);
  if (fences >= HARD_MIN_FENCES || totalChars >= HARD_MIN_CHARS) return 'hard';
  // A tool-bearing turn is an agent doing work, not a "hello" — never trivial.
  if (totalChars <= TRIVIAL_MAX_CHARS && fences === 0 && !hasImage && !hasTools) return 'trivial';
  return 'normal';
}

// Optional Jev backend: one POST to the host's System One endpoint with a
// single score question over a bounded excerpt of the conversation, inside a
// hard timeout budget. Returns null on any non-answer so the caller falls
// back to the heuristic (fail-open).
//
// Zen free tier only answers requests that look like the official OpenCode
// CLI — same identity opencode-free.ts spoofs (see its header comment for the
// full gate). The 5-level score answer is a probability-weighted index
// 0..4; scale it back to the 0..10 the thresholds below expect.
const ZEN_UA = 'opencode/1.18.31 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14';
const COMPLEXITY_CRITERIA = ['trivial', 'simple', 'moderate', 'complex', 'expert'] as const;

function zenSessionId(): string {
  const bytes = new Uint8Array(10);
  globalThis.crypto.getRandomValues(bytes);
  return `ses_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** Bounded excerpt of the conversation, in the System One `state` shape. */
function excerptOf(messages: ChatMessage[] | undefined): string {
  return (messages ?? [])
    .map((m) => `${m.role}: ${contentToString(m.content)}`)
    .join('\n')
    .slice(0, MAX_SCAN_CHARS);
}

/** The ONE typed score question both remote Jev and local decision share. */
function complexityQuestion(): Record<string, { type: 'score'; instructions: string; criteria: string[] }> {
  return {
    complexity: {
      type: 'score',
      instructions: 'Rate the overall complexity of this conversation.',
      criteria: [...COMPLEXITY_CRITERIA],
    },
  };
}

/** Jev/local wire answer → level. The 5-level score is a probability-weighted
 *  index 0..4; scale it back to the 0..10 the thresholds expect. */
function scoreToLevel(raw: number): ComplexityLevel {
  const score = raw * (10 / (COMPLEXITY_CRITERIA.length - 1));
  if (score <= 3) return 'trivial';
  if (score >= 7) return 'hard';
  return 'normal';
}

async function classifyWithJev(
  cfg: ComplexityGateConfig,
  messages: ChatMessage[] | undefined,
): Promise<ComplexityLevel | null> {
  const preset = matchJevPreset(cfg.jevBaseUrl);
  const systemoneUrl = preset?.systemoneUrl
    ?? `${cfg.jevBaseUrl.replace(/\/+$/, '')}/v1/systemone`;
  const apiKey = readJevApiKey();
  // Keyless hosts (zen) work without a key; every other host needs one.
  if (!preset?.keyless && !apiKey) return null;

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (preset?.keyless) {
    headers.authorization = `Bearer ${apiKey ?? 'public'}`;
    headers['User-Agent'] = ZEN_UA;
    headers['x-opencode-client'] = 'desktop';
    headers['x-opencode-session'] = zenSessionId();
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
        state: excerptOf(messages),
        questions: complexityQuestion(),
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      answers?: { complexity?: { score?: unknown } };
    };
    const raw = data.answers?.complexity?.score;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
    return scoreToLevel(raw);
  } finally {
    clearTimeout(timer);
  }
}

/** Local decision backend: the SAME System One wire format, answered in-process
 *  by the decision models on the operator's own keys (Models → Decision) —
 *  free tier, no host to configure, same fail-open contract as Jev. */
async function classifyWithLocalDecision(
  cfg: ComplexityGateConfig,
  messages: ChatMessage[] | undefined,
): Promise<ComplexityLevel | null> {
  if (!decisionsAvailable()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.jevTimeoutMs);
  try {
    const out = await runDecision(
      { state: excerptOf(messages), questions: complexityQuestion() },
      { signal: controller.signal },
    );
    const raw = (out.answers as { complexity?: { score?: unknown } })?.complexity?.score;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
    return scoreToLevel(raw);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Classify one request. Returns undefined when the gate is off or anything
 * goes wrong — callers then leave the ranking untouched, so a Jev outage or a
 * bad key can never change routing behaviour (fail-open, opt-in).
 */
export async function classifyComplexity(
  messages: ChatMessage[] | undefined,
  tools: unknown[] | undefined,
): Promise<ComplexityLevel | undefined> {
  try {
    const cfg = getComplexityGate();
    const strategy = getRoutingStrategy();
    const isSystemOne = strategy === 'systemone';
    if (!cfg.enabled && !isSystemOne) return undefined;

    // When systemone strategy is active, prioritize local decision model or remote jev
    if (cfg.backend === 'decision' || isSystemOne) {
      try {
        const level = await classifyWithLocalDecision(cfg, messages);
        if (level) return level;
      } catch {
        // Decision error/timeout → fall through
      }
    }
    if (cfg.backend === 'jev' || (isSystemOne && cfg.hasJevApiKey)) {
      try {
        const level = await classifyWithJev(cfg, messages);
        if (level) return level;
      } catch {
        // Jev error/timeout → heuristic (layer 2).
      }
    }
    return classifyComplexityHeuristic(messages, tools);
  } catch (err) {
    console.error('classifyComplexity error:', err);
    return undefined;
  }
}
