**English** Â· [ç®€ä½“ä¸­æ–‡](../../zh-cn/env/CHANGELOG.md)

# Changelog

Revision history for `docs/env/`, listing the commits that shaped the runtime configuration surface documented here. Most recent first.

| Commit | Date | Summary |
| --- | --- | --- |
| `992bb833` | 2026-09-02 | feat(proxy): honor TRUST_PROXY for reverse-proxied client IPs (#1041) â€” adds `TRUST_PROXY` (`false\|true\|<hops>\|addr/CIDR`, `.env.example:314`, `server/src/lib/config.ts:95-110` `parseTrustProxy`) forwarded to Express `trust proxy` so Analytics + `PROXY_RATE_LIMIT_RPM`/`ADMIN_RATE_LIMIT_RPM` see real client IP; default `false` (no spoof). |
| `d1b6b463` | 2026-09-01 | Prune the quota observation log in 5k-row chunks (#1124) â€” quota audit trail refinement: chunk `20kâ†’5k` rows (`QUOTA_OBSERVATIONS_PRUNE_CHUNK`) to keep each 60s tick near `250ms` budget (`QUOTA_OBSERVATIONS_PRUNE_BUDGET_MS`, `server/src/services/request-retention.ts:89-90`), backlog drains one chunk per minute until `done`. |
| `8d783d76` | 2026-09-01 | perf: stop the quota panel from ranking the whole observation log on every poll (#1123) â€” introduces `QUOTA_OBSERVATIONS_RETENTION_DAYS=30` / `QUOTA_OBSERVATIONS_MAX_ROWS=200000` (`.env.example:230-233`, `server/src/services/request-retention.ts:22-24` `DEFAULT_QUOTA_OBSERVATIONS_*`), audit trail behind `provider_quota_state` (only newest row per pool read via indexed seek `20260901_000002`), pruned daily by age+count in budgeted chunks, client `staleTime 5sâ†’30s` (`/api/health` 4.9sâ†’12ms). |
| `d3646961` | 2026-09-01 | feat(proxy): Idempotency-Key support â€” stop client retries from double-spending free-tier quota (#1095) â€” introduces `IDEMPOTENCY_TTL_MS=24h` (`server/src/services/idempotency.ts:36,40-42` `idempotencyTtlMs()` â†’ `24*60*60*1000`, `envNum` guard), hash `sha256(key)` + fingerprint `sha256(model+messages+â€¦)` , `409` on conflict, non-streaming `POST /v1/chat/completions` only, in-flight NOT deduped. |
| `de917ea7` | 2026-09-01 | docs(idempotency): the in-flight window is not deduplicated, say so (#1110) â€” corrects `server/src/services/idempotency.ts:16-20` header: duplicate while original still running is `miss` (both execute), no pending-claim state; deliberately out of scope vs wedged key. |
| `ef2471b9` | 2026-09-01 | feat(proxy): auto-detect system-wide proxy settings as a last-resort fallback (#838) â€” adds `detectSystemProxy()` (`server/src/lib/proxy.ts:52-414` `scutil --proxy` / registry `ProxyEnable+ProxyServer` / `gsettings` GNOME `manual`+`http host/port`) at end of `PROXY_URLâ†’dashboardâ†’ALL_PROXYâ†’HTTPS_PROXYâ†’HTTP_PROXYâ†’detectSystemProxy()â†’direct` chain (`resolveProxySource`), closes #353/#1069, best-effort 2s timeout, never throws. |
| `7d430f46` | 2026-08-26 | Add an opt-in Fetch Relay outbound transport (#975) â€” adds `PROXY_MODE` (`forward` default, `fetch-relay` opt-in, `.env.example:76`, `server/src/lib/proxy.ts:52` `PROXY_MODES`) and `FETCH_RELAY_TOKEN` (bearer, encrypted at rest, empty=unauthenticated, `FETCH_RELAY_TOKEN` env precedence over DB, `.env.example:78`, `server/src/lib/proxy.ts:389-417`, `isLoopbackRelayHostname` / `fetchRelayUrlError` loopback guard, `Fetch-Relay-Target/Authorization` headers), cross-links to `../proxy/01-fetch-relay.md`. |
| `c905d87b` | 2026-08-23 | Server log viewer in the dashboard (#993) â€” added `SERVER_LOGS_RETENTION_DAYS` and `SERVER_LOGS_MAX_ROWS` for persisted warn/error logs. |
| `ec4f4e99` | 2026-08-23 | fix(proxy): never route loopback destinations through the proxy (#963) â€” added `SROUTER_PROXY_LOCAL_DESTINATIONS` to opt in to proxying local/LAN endpoints via an ssh tunnel. |
| `65eda974` | 2026-08-20 | fix(modelscope): stop health checks burning magic-grain quota (#882) â€” basis for the `MODELSCOPE_VALIDATE_CACHE_MS` entry. |
| `ebb950a2` | 2026-08-12 | fix(router): warn when MODEL_ROUTING_OVERRIDES never apply (#857) â€” boot-log warning for unmatched model ids. |
| `c28369ca` | 2026-08-12 | feat(vision): end-to-end image input, body limits, inbound normalization (#852) â€” introduced `REQUEST_BODY_LIMIT_MB` and the `IMAGE_NORMALIZE*` knobs. |
| `6a49c81d` | 2026-08-11 | feat(routing): per-model weight overrides via MODEL_ROUTING_OVERRIDES (#747) â€” introduced the routing override variable. |
| `fe0a5f25` | 2026-08-11 | feat(dashboard): automatic update check w/ release-notes dialog (#782) â€” automatic release reminder behind the update-checker settings. |
| `4bfcca20` | 2026-08-10 | feat(proxy): opt-in X-Fallback-Detail header (#792) â€” introduced `FALLBACK_DETAIL_HEADER`. |
| `94b7f7d5` | 2026-08-06 | fix(db): harden data dir so WAL sidecars are covered (#795) â€” data-directory restriction and `SROUTER_DB_DIR_HARDENING`. |
| `1438abbb` | 2026-08-06 | feat: in-dashboard update checker (#635) â€” `SROUTER_UPDATE_CHECK` and related variables. |

Regenerate with `git log --oneline -- .env.example`.
