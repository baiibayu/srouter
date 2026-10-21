**English** Â· [ç®€ä½“ä¸­æ–‡](../../zh-cn/api/CHANGELOG.md)

# API Domain â€” Changelog

Doc revision history for `docs/api/`, seeded from API-relevant commits.

## 2026-10-10

- **docs(api): complexity gate auto-detects hosts from linked provider keys** â€” `GET /api/settings/complexity-gate` now reports `detectedHosts` (preset ids backed by a linked key in Keys, matched by platform or base URL) plus `jevKeyStored` (manual override only); `hasJevApiKey` turns true when a detected host's provider key is available. The scorer **borrows that key at call time** â€” nothing is copied into settings and the value is never echoed. New verified host preset: **OpenRouter** (`https://openrouter.ai/api/v1/systemone`, model `typesafe/jev-1.13`, HTTP 200 verified 2026-10-10). Models â†’ System One shows a green "detected" badge in the host dropdown and an "Automatic â€” from the linked provider key" status line instead of a key input. Sources: `server/src/services/complexity-gate.ts`, `server/src/routes/settings.ts`, `client/src/pages/SystemOnePage.tsx`.
- **docs(api): web-search fallback chain, attempts, and quota counters** â€” `POST /v1/web-search` no longer stops at a single DuckDuckGo fallback: the chosen backend is tried first, then a fixed chain (DuckDuckGo â†’ SearXNG â†’ TinyFish â†’ Exa â†’ Brave â†’ Tavily; keyless/URL-less candidates skipped) runs inside one ~25s budget. A multi-attempt success carries `attempts: [{backend, ok, error?}]`; a total failure answers `502` with every backend's error joined. `GET/PUT /api/settings/web-search` now return `usage: {daily, monthly}` (local attempt counters â€” providers expose no quota API) and **Models â†’ Web** shows them per backend against the published free tiers. Sources: `server/src/services/web-search.ts`, `server/src/routes/tools.ts`, `server/src/routes/settings.ts`.
- **docs(api): Exa + TinyFish join web search; TinyFish joins the fetch chain** â€” `POST /v1/web-search` now documents six backends: DuckDuckGo (keyless default), SearXNG, Tavily, Brave, **Exa** (free tier: $10 credits/month, no card) and **TinyFish** (free: 12k searches/day at any balance; one account-wide key), with the same auto-fallback to DuckDuckGo. `POST /v1/fetch` gains the TinyFish reader before Jina when that key is stored (`via: direct|tinyfish|jina`). The status-page link now deep-links to **Keys â†’ Web search** (`/keys?tab=webSearch`). Sources: `server/src/services/web-search.ts`, `server/src/routes/tools.ts`, `server/src/routes/settings.ts`.

## 2026-10-09

- **docs(api): web search goes multi-backend** â€” `POST /v1/web-search` now documents the backend picker (**Keys page â†’ Providers â†’ Web search backend**; live status on **Models â†’ Web Search**): DuckDuckGo (keyless default), a self-hosted SearXNG instance (JSON format), or Tavily/Brave with a server-stored free-tier key; any backend auto-falls back to DuckDuckGo when unreachable and `provider` reports whichever backend actually answered (captcha/rate â†’ `502` behavior unchanged). Sources: `server/src/services/web-search.ts`, `server/src/routes/settings.ts`.
- **docs(api): document web search + URL fetch utilities** â€” added `POST /v1/web-search` (keyless DuckDuckGo HTML backend, `max_results` 1â€“10, rate/captcha pages surface as `502` rather than an empty result set) and `POST /v1/fetch` (public `http(s)` only, SSRF guard incl. DNS-resolution check before connect, `max_bytes` 1 KiBâ€“2 MiB with a hard body cap, Jina reader fallback, `via: direct|jina`) to `01-rest-api.md`. Both endpoints require the unified inference key (dashboard session tokens rejected) and share the `/v1` proxy limiter. Sources: `server/src/routes/tools.ts`.

## 2026-09-03

- **docs(api): document the task-type routing header** â€” added `X-SRouter-Task-Type: code|chat|auto` (#1127) to the per-request headers section, with the weight shift it applies and the strategies that ignore it.
- **docs(api): document the task-weight-share setting** â€” added `GET/PUT /api/settings/task-weight-share` (#1127), the operator knob for how much weight the task-type bias moves.

## 2026-09-02

- **docs(api): add Idempotency-Key documentation (02-idempotency.md)** â€” documents non-streaming `POST /v1/chat/completions` idempotency from `d3646961` / `de917ea7`: `Idempotency-Key` header (trim + `â‰¤255` UTF-8 bytes, first value on repeat), `replay` vs `409 idempotency_key_conflict` vs `miss` via `lookupIdempotencyReplay`, fingerprint `SHA-256(model+messages+temperature/top_p/max_tokens/tools/tool_choice)`, SHA-256 key-hash storage, `X-Routed-Via: idempotency` zero-cost replay, `stream:true` bypass and `finish_reason:length` not stored, in-flight NOT deduplicated (both attempts execute; pending-claim out of scope per `de917ea7` / `idempotency.ts:17-20`), `IDEMPOTENCY_TTL_MS` 24 h (`idempotencyTtlMs` + `envNum` guard, lazy sweep per `key_hash`), `409` handling, and a `curl` timeoutâ†’retryâ†’replay example. Sources: `server/src/services/idempotency.ts`, `server/src/routes/proxy.ts:1793-1835` + `2640-2656`, migration `20260901_000001_idempotency_claims.ts`. Updated `docs/en/api/OVERVIEW.md` index and added cross-ref in `docs/architecture/04-degraded-mode-and-failover.md:10`.

## 2026-08-25

- **docs(api): document video platforms, free-tier budget, and backups APIs** â€” expanded `POST /v1/videos/generations` with the bounded pollinations/huggingface surface (5-minute timeout, fal queue); added `GET /api/free-tier` (pool-deduped monthly budget) and `GET /api/backups` (DUMP_FORMAT=1, sha256 key fingerprint) endpoint reference.

## 2026-08-23 â€” Docs reorganization

- **386f43e9** `docs(api): fold API guide into api domain` â€” moved `docs/api.md` â†’ `docs/api/01-rest-api.md` with `OVERVIEW.md` + `CHANGELOG.md` scaffold. (landed via #979)

## 2026-08-10 and earlier

- **4bfcca20** feat(proxy): opt-in X-Fallback-Detail header with per-hop failover timings (#792)
- **21499b82** Add prompt and context compression pipeline (#628)
- **079757c1** Split README into focused docs pages (#627)

> Older history for this content is available via `git log --follow -- docs/api.md`.
