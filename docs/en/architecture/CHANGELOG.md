**English** Â· [ç®€ä½“ä¸­æ–‡](../../zh-cn/architecture/CHANGELOG.md)

# Architecture Domain â€” Changelog

Doc revision history for `docs/architecture/`, seeded from commits touching architecture-relevant code.

## 2026-10-09

- **docs(architecture): complexity gate base URL is a setting** â€” the `jev` backend bullet in `01-routing-and-bandit-scoring.md#16` now names `complexity_gate_jev_base_url` (default `https://api.typesafe.ai`, dashboard-editable next to the key): any System One-compatible host â€” v1m, system-one.dev â€” is a drop-in switch. Sources: `server/src/services/complexity-gate.ts`, `server/src/routes/settings.ts`.
- **docs(architecture): document the complexity gate (Jev-B)** â€” new section 16 in `01-routing-and-bandit-scoring.md`: opt-in, default-off, fail-open per-request `trivial/normal/hard` classification that biases weights toward speed (trivial) or intelligence (hard) at a 25% share (`COMPLEXITY_WEIGHT_SHARE`); backends `heuristic` (size/structure rules) vs `jev` (TypeSafe SystemOne `POST /v1/systemone`, 0â€“10 â†’ level, 400 ms timeout, write-only key) via `GET/PUT /api/settings/complexity-gate`; exempt strategies skip the bias; wiring `proxy.ts:classifyComplexity` â†’ `routeRequest` â†’ `orderChain` â†’ `scoring.ts:complexityAdjustedWeights`. Sources: `server/src/services/complexity-gate.ts`.

## 2026-09-02

- **docs(architecture): cross-ref Idempotency-Key replay in degraded-mode doc** â€” `04-degraded-mode-and-failover.md:10` now maps the pre-routing idempotency lookup (`server/src/services/idempotency.ts`, `proxy.ts:1793-1838`) and post-success persist (`proxy.ts:2640-2656`) to the fallback loop, notes `X-Routed-Via: idempotency` zero-cost replay, `stream:true` + `finish_reason:length` exclusion, in-flight NOT deduplicated (`de917ea7`), `IDEMPOTENCY_TTL_MS` 24 h lazy sweep, and that `409` + replay bypass `isDegraded()` / retry budget / hedging. Client contract lives in `docs/en/api/02-idempotency.md` (`d3646961`).

## 2026-08-25

- **docs(architecture): deduplicate `architecture.md` vs `architecture/OVERVIEW.md` intros, clarify `docs/README.md` vs `docs/OVERVIEW.md`** â€” root `architecture.md` is now the high-level index (what the system is, two-paragraph summary, request-flow diagram, limitations and ToS) with a `See [OVERVIEW.md](OVERVIEW.md) for deep-dives` bridge and no duplicated provider/routing summaries (removed the deep-dive reference table and the Routing/Operational detail sections â€” those live in `01`/`02` deep-dives); `architecture/OVERVIEW.md` is now the domain scope (Scope + File Index + How deep-dives fit, high-level index cross-link); `docs/README.md` clarified as the user entry point (getting started) vs `docs/OVERVIEW.md` as the domain index (full file map) and verified no dangling `api.md`/`clients.md`/`compression.md` links (`rg "api\.md|clients\.md|compression\.md" docs --glob '!CHANGELOG.md'` â€” only numbered `01-*.md` hits remain).
- **docs(observability): dedupe 06-observability.md against logs/01-server-logs-viewer.md** â€” the operator-facing log viewer, polling API, env vars, and client implementation now live solely in the logs domain; the observability deep-dive keeps the internals (ingest path, structured provider logs, boot preload, schema) and cross-links both ways. Added the desktop `srouter.log` file-logger note (d74512ba).

## 2026-08-23 â€” Routing, Quota & Chain Overhaul

- **36e7bb0d** feat(router): make the headroom guardrail thresholds tunable (#989)
  - `GET/PUT /api/settings/headroom` exposes `rampStart` and `floor` â€” operators can tune without a code change
  - Thresholds read once per chain (not per model) to avoid uncached `getSetting` per model per request
  - `HEADROOM_RAMP_START` / `HEADROOM_FLOOR` in `scoring.ts`, persisted as `routing_headroom_ramp_start` / `routing_headroom_floor`
  - Out-of-range / non-finite input falls back to defaults rather than silently clamping

- **f0c0925c** feat(router): demote models burning through rpd/tpd windows (#1001)
  - `rateWindowHeadroomFactor(usedFraction, opts)` â€” same tunable ramp driven by live rpm/rpd/tpm/tpd utilization instead of monthly tokens
  - `modelWindowUsedFraction()` in `ratelimit.ts`: one grouped scan of `rate_limit_usage` + one `api_keys` read, memoised for 5s (`WINDOW_USAGE_TTL_MS`)
  - Router takes `Math.min(monthlyHeadroom, windowHeadroom)` â€” the worse of the two, never their product
  - Chosen key = eligible key with the MOST headroom (the one the router would pick next)

- **bf9bf2c0** feat(router): add a least-remaining key selection strategy (#930)
  - New `key_selection_strategy` setting (`auto` / `least-remaining`), independent of the routing strategy
  - `orderKeysByRemainingQuota()` re-sorts by observed remaining quota â€” roomiest key first
  - Skips account-scoped pools (`<platform>::account`) where every key reports the same number
  - Reads quota headroom through cached `getKeyQuotaHeadroom()`; unobserved keys get neutral 0.5

- **c79b5fd6** feat(router): add an opt-in peak-hours routing adjustment (#909)
  - Off by default; configurable window (`startHour`/`endHour`) and IANA `timezone` read via `Intl`
  - `peakAdjustedWeights()` shifts 60% of speed weight onto reliability during the window
  - Exempt strategies: `fastest`, `reliable` (ends of the axis), plus `priority`/`custom` (operator's explicit choice)
  - Dashboard labels adjusted weights from the `adjusted` flag

- **9961ab32** fix(fallback): make a fallback chain mean itself, empty or not (#1023)
  - A profile is now authoritative whenever one is active â€” empty chain reads as "catalog, nothing turned on yet"
  - Saving upserts into the chain; routing follows the same rule (empty active chain routes nothing)
  - Playground offers every custom chain as its `auto:<name>` id

- **b2760fee** feat(fallback): let a fallback chain be built by hand and stay that way (#1004)
  - Chains can start empty; `auto_include_new_models` flag keeps catalog sync from refilling curated chains
  - Routing table gets enable-all / disable-all

- **d4318697** feat(fallback): add a named chain manager to the Fallback page (#988)
  - Collapsed accordion for creating, renaming, deleting named fallback chains, showing the `auto:<name>` id clients send

- **98704bc9** fix(cache): normalize default-valued sampling params in the cache key (#901)
  - `top_p: 1`, `n: 1`, zero penalties â†’ normalized to `undefined`, sharing a cache entry with requests that omit them
  - Cache key version bumped to **v4**; `reasoning_effort` and `compression` added to the key

- **2fab8a36** feat(server): add database backups with safe restore (#999)
  - Backups service, routes, migration, collapsed Backups section under Keys
  - Auth tables excluded; restore checks schema + encryption key fingerprint, runs in one transaction with pre-restore snapshot

## 2026-08-23 â€” Domain Expansion

- **Commit (this PR)**: `docs(architecture): expand into deep-dive domain`
  - Created `docs/architecture/` domain folder with 6 deep-dive docs + `OVERVIEW.md` + `CHANGELOG.md`
  - Root `docs/architecture.md` retained as high-level index, updated with cross-refs
  - `docs/OVERVIEW.md` index updated with architecture/ domain row

## 2026-06-xx â€” Observability & Logging

- **c905d87b** Server log viewer in the dashboard, under an Analytics nav menu (#993)
  - Added `server-logs.ts`: two-tier store (ring buffer + persisted warn/error)
  - Added `GET /api/logs` API with cursor pagination, level/provider/search filters
  - Added log redaction at console wrapper (API keys, tokens, auth headers)
  - Added request analytics (`requests`, `request_attempts` tables) + aggregates view
  - Added attempt tracing via AsyncLocalStorage for `X-Fallback-Detail` header

## 2026-06-xx â€” Routing & Scoring Fixes

- **c2699789** fix(router): context-window safety margin against chars/4 under-counting (#956)
  - Routing token estimate now caps reserved OUTPUT at 2000 tokens (was full max_tokens)
  - Prevents falsely excluding entire free pool on huge client max_tokens
  - Input still counted in full; upstream 429/413 handled by retry loop

- **26cebd24** Fix a batch of routing, streaming, and deployment quick wins (#941)
  - Multiple small fixes across router, proxy, quota, catalog sync

- **f6ba3f74** fix(router): warn when MODEL_ROUTING_OVERRIDES will never apply (#738) (#857)
  - Validates override model IDs exist in catalog at save time

- **95178eb7** fix(fallback): reset model-failure windows between tests and thread an injectable now (#856)
  - Testability improvements for model failure benching

## 2026-05-xx â€” Degraded Mode & Failover v2

- **b72d9565** feat(server): degraded-mode state machine (#904) (#906)
  - New `degradation.ts`: healthy-provider ratio tracker with hysteresis
  - Enters degraded when ratio < 50% for 60s (configurable), exits after 120s above
  - In degraded: bandit exploration disabled, sticks to scored healthy providers
  - Health endpoint + dashboard report state

- **eb9539d7** feat(fallback): abort stalled attempts when the retry time budget expires (hedging) (#828)
  - `abortInFlight()` cancels upstream fetch via AbortController when wall-clock budget expires mid-attempt
  - `HedgeAbortError` = non-provider-health â†’ no cooldown/penalty
  - Renders `timedOut` exhaustion with budget note
  - Streaming surfaces call `ctx.disarmHedge()` on first byte

- **4bfcca20** feat(proxy): opt-in X-Fallback-Detail header with per-hop failover timings (#792)
  - `X-Fallback-Detail`: `platform/model keyN=outcome t=start+dur msg=summary; â€¦`
  - Opt-in via `EXPOSE_FALLBACK_DETAIL_HEADER=1` or setting
  - 2KB budget, 120 chars per message, max 10 hops

- **62203049** fix(routing): fail over on a relay's bare "safe"/"unsafe" classification output (#809) (#830)
  - Detects bare classification words from relay models (OpenCode Zen)
  - Treats as empty completion â†’ fail over with `skipBench: true` when `finish_reason=length`

## 2026-04-xx â€” Routing Enhancements

- **6a49c81d** feat(routing): per-model weight overrides via MODEL_ROUTING_OVERRIDES (#747)
  - `MODEL_ROUTING_OVERRIDES='{"model-id": {"weight": 0.5}}'` scales final effective score
  - Demotes without disabling; priority chain can still select

- **f220d567** feat(routing): fold community reliability priors into the Beta posterior (#744)
  - Opt-in `routing_community_prior_enabled` folds de-poisoned aggregated counts from other instances
  - Capped at 50 effective samples per prior so local evidence dominates

- **ae1fcccc** feat(routing): add an exploration toggle for unmeasured models (#731)
  - `routing_explore_enabled=1` gives unmeasured models (<5 samples) 10% guaranteed chance to be tried first
  - Prevents starvation by prior-heavy rivals

- **9565dd1e** fix(router): let timeouts cost speed, and write an observed speed_rank (#619)
  - Timeouts now feed speed axis: capped latency (120s) + zero tokens â†’ drags throughput down
  - TTFB sample at capped latency â†’ past TTFB_WORST_MS â†’ no latency credit
  - Periodic writeback of observed speed_rank (1..10) for models with â‰¥20 speed samples

- **db1c4d77** Fix routing chain semantics
  - Dense ranking + penalty fixes for priority strategy

## 2026-03-xx â€” Quota & Cooldown Engine

- **9c5031c3** feat: Premium live catalog â€” signed sync, license keys, self-serve billing
  - Live catalog tier (2-3 day refresh) for premium licenses
  - Monthly snapshot tier (30-day trail) for free installs
  - Ed25519 signed catalogs, pinned public key, boot re-apply from cache
  - Model-age gate (30 days), premium/free tiers, migration seeding vs hosted catalog

- **d15a0465** fix: default output floor on Cloudflare + pace the health probe pass (#553) (#644)
  - Health probe pacing, Cloudflare output floor

- **303b0912** fix(ratelimit): escalate NULL-limit providers via hit-count heuristic (#392)
  - Providers with no published RPD/TPD: 2+ 429s in 1h â†’ "effectively daily exhausted"
  - Escalates but capped at 10 min (UNKNOWN_LIMIT_MAX_COOLDOWN_MS)
  - Reversible: success clears hit window

- **be65630b** fix: rate ledger drift, token double-count, penalty decay, error sanitization
  - Fixed in-flight lease accounting, penalty decay, error redaction

- **cc52f732** feat(routing): honor upstream Retry-After when benching a key
  - Retry-After honored as floor, capped at 24h, source = 'authoritative'

- **9c002ffc** filter v1 models by connected providers
  - `/v1/models` shows availability per provider key status

- **3656efee** feat(router): skip models whose tpm_limit can't fit the request
  - Pre-check TPM against estimated tokens

- **7d5555d2** feat(proxy): agent turn integrity â€” stream validation, tool-dialect rescue, sticky-session fixes (#231 audit)
  - Stream validation: headers held until first payload
  - Tool dialect rescue: inline tool calls â†’ structured tool_calls
  - Sticky sessions: 30min TTL keyed by first user message hash

- **83f5b1f0** refactor(gateway): unify the four provider fallback loops, fix drift (#482 base) (#483)
  - Single `fallback-loop.ts` for `/v1/chat/completions`, `/v1/responses`, `/v1/messages`, `/v1/completions`
  - Eliminated drift in cooldowns, exhaustion rendering, attempt trail

- **cd32ca1d** feat(gateway): fallback hardening pack (401 rotation, rich exhaustion, daily-quota bench, truncation policy, retry budget, usage fallback) (#484)
  - 401 â†’ immediate key revalidation + 5min bench
  - Daily quota exhaustion â†’ bench until UTC midnight
  - Retry time budget (45s default)
  - Rich exhaustion bodies with attempt trail

## 2026-02-xx â€” Catalog & Provider Quota

- **7cbec020** feat(catalog-sync): re-apply the cached catalog on every boot
  - Solves drift: migrations re-assert baseline, boot sync 304s, cached doc re-applied

- **aa91b78b** feat(router): enforce provider-wide daily request caps (#162)
  - OpenRouter 1000/day (50/day <10 credits), ModelScope 2000/day
  - Provider-wide RPM: NVIDIA NIM 40 RPM

- **d7cc028b** fix(routing): multi-key quota fixes for #470, #454, #456, #453 (#479)
  - Pooled monthly budget: `monthly_token_budget Ã— usableKeyCount`
  - Per-key scoring for key selection within model

## 2026-01-xx â€” Early Architecture

- **4d1aa600** feat(router): analytics-driven bandit routing with weighted axes
  - Thompson sampling bandit with reliability/speed/intelligence axes
  - Guardrails: headroomFactor, rateLimitFactor
  - Strategy presets: balanced, smartest, fastest, reliable, custom

- **9ad90a79** fix(router): escalating cooldown for repeated 429s (credits @meliani) (#92)
  - Ladder: 2m â†’ 10m â†’ 1h â†’ 24h per model+key over 24h window

- **7969ee4d** fix: rate-limit and cooldown state is lost on restart (#88)
  - Persisted cooldowns to SQLite (`rate_limit_cooldowns` table)

- **25be012d** fix(router): treat provider 400 errors as retryable (#80)
  - 400 â†’ failover instead of hard error

- **765c1c84** fix: non-decryptable keys can block routing (#85)
  - Decrypt errors â†’ skip key, don't block chain

- **0cd1c73b** fix(router): treat 404 model-removed as retryable (#76)
  - 404 â†’ fail over to next model

- **29cf2212** fix(router): treat 413 Payload Too Large as retryable (#64)
  - 413 â†’ fail over

- **1ebe6d07** feat(proxy): expose 'auto' as a virtual model in /v1/models (#62)
  - `model: "auto"` or omitted â†’ router picks

- **b144bff1** feat(router): exhaust all keys before falling back + tests (#42)
  - Round-robin all keys for a model before next model

## 2025 â€” Foundation

- **7f06185b** Initial release of SRouter
  - Basic router, rate limiting, provider adapters, SQLite storage