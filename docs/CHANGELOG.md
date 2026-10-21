## 2026-10-21 — 0.1.12

| Commit | Date | Summary |
| --- | --- | --- |
| `924c94a0` | 2026-10-21 | docs: README quickstart refresh, full endpoint table, Decision System One and Web Tools sections, breaker default-off note. |
| `b26caf79` | 2026-10-21 | chore: align all package versions (server, client, cli, desktop, shared) to 0.1.12 with matching CLI update-check tests. |
| `46aaa6e2` | 2026-10-21 | fix(repo): enforcement contact points to SRouter's own mailbox, drop upstream identity leak. |
| `60ce8f9b` | 2026-10-21 | fix(api): chat-judge picks a real catalog model per platform — 'auto' 404s on provider APIs. |
| `69e2e010` | 2026-10-21 | feat(api): decision chat-judge via cheapest linked provider key before heuristic fallback. |
| `eda22706` | 2026-10-21 | feat(fetch): local fetch source registry (tinyfish-fetch, jina-reader) with usage-aware dashboard endpoints. |
| `6b12fafd` | 2026-10-21 | feat(api): POST /v1/decision endpoint (System One) with heuristic fail-open and agent reliability timeline. |
| `96ffc30c` | 2026-10-21 | fix(reliability): breaker off by default, SSE keepalive without header regression, coherent time budgets. |
| `e210186` | 2026-10-21 | feat: unify search/fetch — single /v1/search, drop legacy backend. |
| `e4532204` | 2026-10-21 | feat(client): web fetch/search engines UX — fetch cards, usage card, Web Tools keys section. |
| `1bbb99e` | 2026-10-21 | feat(client): web engine keys live only in Web Tools — add-key form and grouped list drop search providers. |
| `d74ccc3` | 2026-10-21 | merge: batch-c update & perbaikan (24 item, gate hijau). |
| `7a78b8b` | 2026-10-21 | merge: batch-b update & perbaikan (30 item, gate hijau). |

## 2026-10-16 — 0.1.3

| Commit | Date | Summary |
| --- | --- | --- |
| `68dbc1af` | 2026-10-16 | feat(cli): single-package merge — `@baiibayu/srouter` now ships the gateway and the dashboard itself: `scripts/prepare-cli-pack.mjs` stages `server/dist`, `client/dist` and `desktop/package.json` at prepack (and cleans them at postpack), the CLI inlines the server runtime deps and drops `@aiibayu/srouter-server`, `serve.ts` resolves the bundled gateway, `cli-release.yml` build + CLI-test + smoke-boots the packaged `srouter serve` before publishing; versions bumped to 0.1.3. |
| `9fb9faf0` | 2026-10-16 | docs: install-first flow — Quick Start leads with `npm install -g @baiibayu/srouter` + bare `srouter`; every `npx srouter …` example becomes `srouter …` (bare `npx srouter` 404s on the registry) with an italic `npx @baiibayu/srouter` fallback note; scoped npx kept for the cli/README headline and the `/agents` copy buttons. |

## 2026-10-15 — 0.1.2

| Commit | Date | Summary |
| --- | --- | --- |
| `9caa8537` | 2026-10-15 | feat(agents): add Zed, JetBrains, OpenClaude and AtomCode to the coding-agent catalog (20 -> 24). README already carried the logos for zed, jetbrains and atomcode; openclaude has no published mark and renders as a lettermark for now. |
| `b92e2485` | 2026-10-15 | feat(agents): add logos for Zed, JetBrains, OpenClaude and AtomCode on the `/agents` page; move Generic OpenAI client to the last position in the catalog. |
| `9ebd8f2e` | 2026-10-15 | fix(agents): replace OpenCode and Goose placeholder icons with their official published logos (OpenCode mark from `packages/identity/mark.svg`; Goose logo from `aaif-goose/goose`). |
| `e3dd2f1e` | 2026-10-15 | fix(agents): OpenClaude — official logo from `Twigpine/openclaude` (`web/public/openclaude.png`), docs URL `https://openclaude.twigpine.com/docs/quickstart/`, protocol OpenAI Chat (was incorrectly Anthropic Messages), base URL `/v1`. |
| `7ca6802e` | 2026-10-15 | fix(cli): `setup-zed`, `setup-jetbrains`, `setup-openclaude`, `setup-atomcode` — use `ctx.url` instead of hardcoded `localhost:20268`, and drop the duplicate `/v1` suffix that produced `/v1/v1` in the printed base URL. |
| `7ca6802e` | 2026-10-15 | fix(cli): add `modelBehavior` to `ToolDefinition`, `tools.json` and the tool metadata catalog so the dashboard-metadata sync test passes again (the field was introduced in 0.1.1 on the client side only). |
| `6219e7d3` | 2026-10-15 | fix(readme): revert incorrect branding introduced by an external tool — "OpenCode" and "Goose" names were mistranslated to "Buka OpenCode"/"Buka Goose" and a table row was corrupted; restore correct brand names. |

## 2026-10-15 — 0.1.1

| Commit | Date | Summary |
| --- | --- | --- |
| `af0a0c7e` | 2026-10-15 | feat(routing): expose built-in `auto:balanced/auto:smart/auto:fast/auto:reliable` chains in `GET /v1/models` so setup and the model picker offer them without going through the dashboard. `auto` still follows the Routing strategy; the `auto:<axis>` entries force a preset and bypass it. `auto:cheap` is deliberately omitted — it is an alias for `balanced`. |
| `af0a0c7e` | 2026-10-15 | refactor(i18n): shorten virtual model labels — "Auto (router picks the best available model)" → "Auto", "Fusion (panel of models...)" → "Fusion", "Auto: Default (named fallback chain)" → "Auto: Default". |
| `af0a0c7e` | 2026-10-15 | feat(agents): `/agents` cards now note whether `npx srouter setup-*` brings in every model (OpenCode, Hermes, Goose, Qwen, DeepSeek Harness, MiMo) or only `auto` (Claude Code, Codex, Cline, Continue, Aider, Roo, Kilo, Crush, Oh My Pi, OpenClaw, Pi, Factory Droid, Cursor, Generic). |
| `af0a0c7e` | 2026-10-15 | fix(client): silence TS6 deprecation for `baseUrl` (`ignoreDeprecations: "6.0"`). |

# Changelog

Revision history for `docs/`, derived from git commits touching this directory. Most recent first. Rows marked "landed via #N" describe work done on a contributor branch and squash-merged; the commit shown is the squash on `main`.

## 2026-09-05 — Per-language structure

| Commit | Date | Summary |
| --- | --- | --- |
| `08bc5479` | 2026-09-05 | docs(zh-cn): translate the four stub pages, fix the Chinese index, anchors and language switchers (#1167) |
| `6424a1ea` | 2026-09-05 | docs: per-language layout `docs/{en,zh-cn}`, Chinese README, redirect stubs at the old paths (#1164). Squash of the contributor branch: scaffold `en/` and `zh-cn/`, move the 17 English domains under `en/`, migrate the Chinese translations out of `docs/i18n/zh-CN/docs/` into `zh-cn/`, translate the cli, desktop, proxy, fallback, glossary and troubleshooting domains, fix link depths. |
| `386f43e9` | 2026-09-01 | docs: per-domain folders with OVERVIEW/CHANGELOG metadata (#979). Squash of the contributor branch whose rows are dated 2026-08-22 to 2026-08-25 below. |

## 2026-09-02

| Commit | Date | Summary |
| --- | --- | --- |
| `6424a1ea` | 2026-09-02 | docs(proxy): create proxy domain and move Fetch Relay into it — `01-fetch-relay.md` moved from flat `fetch-relay.md`, `detectSystemProxy()` OS auto-detect, `TRUST_PROXY` (landed via #1164) |
| `6424a1ea` | 2026-09-02 | docs(env): cover `PROXY_MODE`, `FETCH_RELAY_TOKEN`, `TRUST_PROXY`, `QUOTA_OBSERVATIONS_*`, `IDEMPOTENCY_TTL_MS` — full precedence chain, callout boxes (landed via #1164) |
| `6424a1ea` | 2026-09-02 | docs(api): document Idempotency-Key safe retries (`02-idempotency.md`) — replay/409/miss, fingerprint, curl example (landed via #1164) |

## 2026-08-25

| Commit | Date | Summary |
| --- | --- | --- |
| `386f43e9` | 2026-08-25 | docs(api): document video platforms (pollinations/huggingface, 5-min bound, fal queue), free-tier budget API (`GET /api/free-tier`, pool-deduped), and backups API (`GET /api/backups`, DUMP_FORMAT=1, sha256 fingerprint) (landed via #979) |
| `386f43e9` | 2026-08-25 | docs(fallback): add named-chains domain — chain lifecycle, empty-chain authoritative 400 (`activeChainOrThrow`, 9961ab32), `auto:<name>` in `GET /v1/models` (06efa5ff), `profiles.auto_include_new_models` (b2760fee), named-chain manager UI (d4318697) (landed via #979) |
| `386f43e9` | 2026-08-25 | docs(observability): dedupe 06-observability.md against logs viewer, cross-link both ways, add desktop `srouter.log` file-logger note (d74512ba) (landed via #979) |
| `386f43e9` | 2026-08-25 | docs(providers): refresh free-tier numbers to 34 providers / 474 families / 635 endpoints (~7.4B tokens/month) in providers/OVERVIEW.md and providers/01-supported-platforms.md (landed via #979) |

## 2026-08-23

| Commit | Date | Summary |
| --- | --- | --- |
| `386f43e9` | 2026-08-23 | docs(meta): fix broken links from 2026-08-23 doc updates — 24 links fixed across 16 files (api/compression/clients/i18nzh) (landed via #979) |
| `0fcf5ef5` | 2026-08-23 | feat(cli): setup-dsh — configure DeepSeek Harness in one command (#995) |
| `16d200bb` | 2026-08-23 | perf(compression): early-exit protected-span check in the per-line hot path (#990) |
| `c905d87b` | 2026-08-23 | Server log viewer in the dashboard, under an Analytics nav menu (#993) |
| `386f43e9` | 2026-08-22 | docs(meta): index providers/testing domains and log today's additions (landed via #979) |
| `386f43e9` | 2026-08-22 | docs(testing): add test matrix and compatibility-suite documentation (landed via #979) |
| `386f43e9` | 2026-08-22 | docs(providers): add platform catalog and integration guides (landed via #979) |
| `386f43e9` | 2026-08-22 | docs(deployment): add Docker operations and maintenance domain (landed via #979) |
| `386f43e9` | 2026-08-22 | docs(env): add runtime configuration reference domain (landed via #979) |


## 2026-08-10 and earlier

| Commit | Date | Summary |
| --- | --- | --- |
| `4bfcca20` | 2026-08-10 | feat(proxy): opt-in X-Fallback-Detail header with per-hop failover timings (#792) |
| `9ddd75fe` | 2026-08-10 | fix(anthropic): stop silently dropping document content blocks (#793) |
| `1952ad1c` | 2026-08-03 | fix(i18n): polish zh-CN strings (#740) |
| `bc3dd0ad` | 2026-08-03 | docs(docker): explain why a container cannot reach providers the host can (#737) |
| `043b06ff` | 2026-08-03 | fix(headers,clipboard): serve dashboard cleanly over plain HTTP (#735) |
| `d5dbf9e0` | 2026-08-01 | docs(i18n): give the zh README a 贡献者 heading (#701) |
| `c2fba4ad` | 2026-07-31 | docs: center language toggle above hero screenshot (#691) |
| `d41ff3e4` | 2026-07-31 | docs(i18n): translate install.md and api.md into zh-CN (#690) |
| `199d5bf0` | 2026-07-31 | docs(i18n): add translated-docs tree + zh-CN README (#689) |
| `29bb51f4` | 2026-07-31 | docs(i18n): pin zh glossary, land two agreed zh-CN fixes (#683) |
| `dbed9e0b` | 2026-07-30 | cli: publish SRouter to npm (#672) |
| `559b939a` | 2026-07-29 | feat(custom): per-endpoint identity for relay models (#659) |
| `ed4e7225` | 2026-07-28 | fix(server): make X-Routed-Via header-safe (#639) |
| `498fdf4a` | 2026-07-27 | Add end-to-end coding-agent compatibility suite (#629) |
| `21499b82` | 2026-07-27 | Add prompt and context compression pipeline (#628) |
| `079757c1` | 2026-07-27 | Split README into focused docs pages (#627) |
| `52073d69` | 2026-07-20 | Termux support, docs index, health-check error surfacing (#573) |
| `d4f3c9cd` | 2026-06-20 | ci(desktop): Windows .exe + macOS .dmg installers; Windows install path (#349) |
| `9c5031c3` | 2026-06-10 | feat: Premium live catalog — signed sync, license keys, self-serve billing |
| `1ce89e88` | 2026-06-07 | feat(catalog): V24 Zen roster refresh |
| `df7920d8` | 2026-06-07 | feat(catalog): V23 free-tier audit |
| `f2f6aec9` | 2026-05-31 | docs(site): landing page update to 16 providers (~1.7B tokens) (#150) |
| `5e648735` | 2026-05-02 | fix(catalog): 400 on explicit unknown/disabled model + sync docs (#24) |
| `9181847d` | 2026-05-02 | docs: Open Graph + Twitter Card meta + OG image (#21) |

Regenerate with `git log --oneline -- docs/`.
