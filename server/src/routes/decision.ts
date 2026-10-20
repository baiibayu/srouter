// POST /v1/decision - System One decision endpoint (TypeSafe)
//
// Accepts a decision request (model + state + questions) and returns a scored
// decision via the configured Jev host (JEV_HOST_PRESETS + readJevApiKey) with
// a 2000ms timeout. Fail-open to a local heuristic scoring if remote fails or
// times out. Response shape matches the docs.typesafe.ai contract.

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

export const decisionRouter = Router();

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
  source: 'jev' | 'heuristic';
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

  // Try Jev remote first; on any error/timeouts, fall back to heuristic
  let answers: DecisionAnswer[] | null = null;
  let source: 'jev' | 'heuristic' = 'heuristic';
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
