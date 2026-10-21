[English](../../en/env/CHANGELOG.md) Â· **ç®€ä½“ä¸­æ–‡**

# å˜æ›´è®°å½•

`docs/env/` çš„ä¿®è®¢åŽ†å²ï¼Œåˆ—å‡ºå¡‘é€ äº†æœ¬æ–‡æ¡£æ‰€è¿°è¿è¡Œæ—¶é…ç½®é¢çš„æäº¤ã€‚æœ€æ–°åœ¨å‰ã€‚

| Commit | Date | Summary |
| --- | --- | --- |
| `65eda974` | 2026-08-20 | fix(modelscope): stop health checks burning magic-grain quota (#882) â€” basis for the `MODELSCOPE_VALIDATE_CACHE_MS` entry. |
| `ebb950a2` | 2026-08-12 | fix(router): warn when MODEL_ROUTING_OVERRIDES never apply (#857) â€” boot-log warning for unmatched model ids. |
| `c28369ca` | 2026-08-12 | feat(vision): end-to-end image input, body limits, inbound normalization (#852) â€” introduced `REQUEST_BODY_LIMIT_MB` and the `IMAGE_NORMALIZE*` knobs. |
| `6a49c81d` | 2026-08-11 | feat(routing): per-model weight overrides via MODEL_ROUTING_OVERRIDES (#747) â€” introduced the routing override variable. |
| `fe0a5f25` | 2026-08-11 | feat(dashboard): automatic update check w/ release-notes dialog (#782) â€” automatic release reminder behind the update-checker settings. |
| `4bfcca20` | 2026-08-10 | feat(proxy): opt-in X-Fallback-Detail header (#792) â€” introduced `FALLBACK_DETAIL_HEADER`. |
| `94b7f7d5` | 2026-08-06 | fix(db): harden data dir so WAL sidecars are covered (#795) â€” data-directory restriction and `SROUTER_DB_DIR_HARDENING`. |
| `1438abbb` | 2026-08-06 | feat: in-dashboard update checker (#635) â€” `SROUTER_UPDATE_CHECK` and related variables. |

Regenerate with `git log --oneline -- .env.example`.
