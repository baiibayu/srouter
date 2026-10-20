# Agent Reliability Timeline — OpenClaude / Codex / Claude-Code

Documenting incidents and operational instability experienced by AI coding agents (`openclaude`, `codex`, `claude-code`) connected via SRouter, including root causes, applied fixes, and recommendations for agent integrations.

---

## Incidents & Root Causes

### 1. HTTP 413 `request_token_budget` Rejection

- **Symptom**: Agents experienced unexpected HTTP 413 payload/budget rejections on turns with long context or large tool schema definitions.
- **Root Cause**: `readGuardrailValue` defaulted to an aggressive 3-token ceiling fallback when reading unconfigured guardrail values (`REQUEST_MAX_TOKENS_BUDGET`).
- **Fix Applied**: Updated guardrails configuration in SRouter so default budget is `0` (disabled/unrestricted by default unless explicitly configured by operator).
- **Status**: Fixed in SRouter core (`server/src/lib/guardrails.ts`).
- **Agent-side Recommendation**: Ensure client-side max token requests do not set arbitrarily huge token bounds unless required; observe model context limits returned in `/v1/models`.

---

## 2. Aborted Connections & Dropped Streams during Local Development

- **Symptom**: Agent sessions dropped or reset every time a file in the SRouter repository was modified during active sessions.
- **Root Cause**: SRouter `npm run dev` script used `tsx watch`, causing full process restarts and instant connection drops on any file save.
- **Fix Applied**: Updated `package.json` dev script to run `tsx` directly without watch mode (`tsx src/index.ts`).
- **Status**: Fixed in `server/package.json`.
- **Agent-side Recommendation**: Reconnect automatically with exponential backoff on connection resets (`ECONNRESET`, `socket hang up`).

---

## 3. Timeout Mismatches (Per-Hop vs First-Byte vs Attempt Budget)

- **Symptom**: Long reasoning turns or heavy prefill prompts timed out prematurely before receiving the first byte.
- **Root Cause**: Gateway attempt budgets and per-hop provider timeouts were shorter (60s / 90s first-byte budget) than total attempt duration budgets, leading to early aborts on slow upstream providers.
- **Fix Applied**: Configured coherent time budgets (`FALLBACK_TIME_BUDGET_MS` defaulting to 45s+ with per-platform stream stall overrides up to 90s+).
- **Status**: Fixed in `server/src/lib/provider-timeout.ts` and `fallback-loop.ts`.
- **Agent-side Recommendation**: Support streaming responses and set client-side request timeout to at least 120s for reasoning/complex turns.