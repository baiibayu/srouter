// Complexity gate — "Jev-B" (opt-in, fail-open).
//
// Classifies each chat request as trivial | normal | hard and feeds that level
// into the bandit as a SOFT weight bias (prefer fast/cheap models for trivial
// prompts, smart models for hard ones). Capability gates and the fallback
// chain are untouched; `undefined` means "leave the preset weights alone".
//
// Backend layers (pluggable, per the 2026-10-05 decision):
//   1. Jev (TypeSafe System One, optional) — typed score question over the
//      prompt, ~400ms budget, requires an API key; any error/timeout falls
//      through layer 2.
//   2. Heuristic local (the permanent backend) — bounded reads of the prompt
//      text: length, fenced code blocks, image parts, tools. Microseconds,
//      zero network, zero RAM/model cost, never throws.
//
// Master switch is OPT-IN (disabled by default): absent a signal the routing
// preset stands, exactly like the task-type bias (#1127).

import { getSetting, setSetting, getDb } from '../db/index.js';
import type { ChatMessage } from '@srouter/shared/types.js';
import { contentToString } from '../lib/content.js';

export type ComplexityLevel = 'trivial' | 'normal' | 'hard';

export interface ComplexityGateConfig {
  enabled: boolean;
  backend: 'heuristic' | 'jev';
  jevBaseUrl: string;
  jevTimeoutMs: number;
  hasJevApiKey: boolean;
}

export const COMPLEXITY_GATE_ENABLED_KEY = 'complexity_gate_enabled';
export const COMPLEXITY_GATE_BACKEND_KEY = 'complexity_gate_backend';
export const COMPLEXITY_GATE_JEV_BASE_KEY = 'complexity_gate_jev_base_url';
export const COMPLEXITY_GATE_JEV_KEY_KEY = 'complexity_gate_jev_api_key';
export const COMPLEXITY_GATE_JEV_TIMEOUT_KEY = 'complexity_gate_jev_timeout_ms';

export const DEFAULT_JEV_BASE_URL = 'https://api.typesafe.ai';
export const DEFAULT_JEV_TIMEOUT_MS = 400;
const VALID_BACKENDS = ['heuristic', 'jev'] as const;

function readJevApiKey(): string | null {
  const raw = getSetting(COMPLEXITY_GATE_JEV_KEY_KEY);
  return raw === undefined || raw.trim() === '' ? null : raw;
}

export function getComplexityGate(): ComplexityGateConfig {
  const backendRaw = getSetting(COMPLEXITY_GATE_BACKEND_KEY);
  const timeoutRaw = Number(getSetting(COMPLEXITY_GATE_JEV_TIMEOUT_KEY));
  const baseRaw = getSetting(COMPLEXITY_GATE_JEV_BASE_KEY);
  return {
    enabled: getSetting(COMPLEXITY_GATE_ENABLED_KEY) === '1',
    backend: backendRaw && (VALID_BACKENDS as readonly string[]).includes(backendRaw)
      ? backendRaw as 'heuristic' | 'jev'
      : 'heuristic',
    jevBaseUrl: baseRaw && baseRaw.trim() !== '' ? baseRaw.trim() : DEFAULT_JEV_BASE_URL,
    jevTimeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw >= 50 && timeoutRaw <= 5000
      ? timeoutRaw
      : DEFAULT_JEV_TIMEOUT_MS,
    hasJevApiKey: readJevApiKey() !== null,
  };
}

export interface ComplexityGatePatch {
  enabled?: boolean;
  backend?: 'heuristic' | 'jev';
  jevBaseUrl?: string | null;
  jevApiKey?: string | null;
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

// Optional Jev backend: one POST /v1/systemone score question over a bounded
// excerpt of the conversation, inside a hard timeout budget. Returns null on
// any non-answer so the caller falls back to the heuristic (fail-open).
async function classifyWithJev(
  cfg: ComplexityGateConfig,
  messages: ChatMessage[] | undefined,
): Promise<ComplexityLevel | null> {
  const apiKey = readJevApiKey();
  if (!apiKey) return null;
  const excerpt = (messages ?? [])
    .map((m) => `${m.role}: ${contentToString(m.content)}`)
    .join('\n')
    .slice(0, MAX_SCAN_CHARS);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.jevTimeoutMs);
  try {
    const res = await fetch(`${cfg.jevBaseUrl.replace(/\/+$/, '')}/v1/systemone`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'jev-latest',
        state: excerpt,
        questions: { complexity: { type: 'score', min: 0, max: 10 } },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      answers?: { complexity?: { value?: unknown; score?: unknown } | number };
    };
    const raw = data.answers?.complexity;
    const score = typeof raw === 'number' ? raw
      : typeof raw?.value === 'number' ? raw.value
      : typeof raw?.score === 'number' ? raw.score
      : null;
    if (score === null || !Number.isFinite(score)) return null;
    if (score <= 3) return 'trivial';
    if (score >= 7) return 'hard';
    return 'normal';
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
    if (!cfg.enabled) return undefined;
    if (cfg.backend === 'jev') {
      try {
        const level = await classifyWithJev(cfg, messages);
        if (level) return level;
      } catch {
        // Jev error/timeout → heuristic (layer 2).
      }
    }
    return classifyComplexityHeuristic(messages, tools);
  } catch {
    return undefined;
  }
}
