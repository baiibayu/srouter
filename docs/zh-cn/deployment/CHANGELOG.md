[English](../../en/deployment/CHANGELOG.md) Â· **ç®€ä½“ä¸­æ–‡**

# å˜æ›´è®°å½•

`docs/deployment/` çš„ä¿®è®¢åŽ†å²ï¼Œåˆ—å‡ºå¡‘é€ äº†æœ¬æ–‡æ¡£æ‰€è¿° Docker è¿ç»´ä¸Žç»´æŠ¤è¡Œä¸ºçš„æäº¤ã€‚æœ€æ–°åœ¨å‰ã€‚

| Commit | Date | Summary |
| --- | --- | --- |
| `26cebd24` | 2026-08-20 | Fix batch of routing, streaming, deployment quick wins (#941). |
| `1438abbb` | 2026-08-06 | feat: in-dashboard update checker, single Settings update surface (#635). |
| `bc3dd0ad` | 2026-08-03 | docs(docker): why a container cannot reach providers the host can (#737) â€” source of the troubleshooting section in [01-docker.md](01-docker.md). |
| `377622fe` | 2026-08-02 | fix(version,desktop): serve release version to every install (#718). |
| `8a3a2a07` | 2026-07-19 | fix(docker): copy server/node_modules into runtime so proxy loads undici (#550). |
| `87fbf0cc` | 2026-07-06 | security: first-run setup code, key file out of DB, CSV export hardening (#477). |
| `2331e095` | 2026-06-27 | catalog controls, persistence backup, declarative config â€” basis for the config/backup sections in [02-updates-and-backup.md](02-updates-and-backup.md). |
| `f39975fc` | 2026-05-31 | fix(docker): build toolchain for better-sqlite3 native compile (#143). |
| `026dce7d` | 2026-05-30 | feat(docker): Docker + GHCR support, multi-arch & localhost-bind (#129). |

Regenerate with `git log --oneline -- Dockerfile docker-compose.yml .dockerignore`.
