**English** Â· [ç®€ä½“ä¸­æ–‡](../../zh-cn/desktop/CHANGELOG.md)

# Changelog â€” desktop

| Commit | Date | Summary |
| --- | --- | --- |
| `d74512ba` | 2026-08-24 | Desktop log file plus a passwords, logs and uninstall FAQ (#1002) â€” `desktop/src/logger.ts` `FileSink` + rotation + tray open folders |
| `9182fbb5` | 2026-08-23 | Bring the desktop boot sequence up to server parity and bump to 0.8.7 (#1017) â€” `server-host.ts` mirrors `index.ts` steps, cross-checked by `server-host-boot.test.ts` |
| `731d37d4` | 2026-08-23 | Fix: outlive the reverse proxy's idle connection pool (#1116) â€” keepAlive path touches server-host |
| `26245d4f` | 2026-08-23 | Add an rpm target to the Linux desktop build (#981) â€” `electron-builder.yml` `rpm x64` beside `deb` |
| `2d1ef373` | 2026-08-23 | Bump desktop to v0.9.0 (#1044) â€” version bump |
| `b79de39b` | 2026-08-23 | Mac builds are signed and notarized â€” closes #373 #943 (#1035) |
| `bec4e93b` | 2026-08-23 | Notarize the DMG itself, not just the app inside it (#1036) |
| `93a736c5` | 2026-08-23 | Bump desktop to v0.9.1 (#1115) |

Regenerate: `git log --oneline -- desktop/`
