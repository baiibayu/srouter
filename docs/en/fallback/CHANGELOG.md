**English** Â· [ç®€ä½“ä¸­æ–‡](../../zh-cn/fallback/CHANGELOG.md)

# Fallback Domain â€” Changelog

Doc revision history for `docs/fallback/`, seeded from fallback-relevant commits.

## 2026-08-25

- **docs(fallback): scaffold fallback domain** â€” new `docs/fallback/` domain with `OVERVIEW.md` + `CHANGELOG.md`, and `01-named-chains.md` covering the chain lifecycle, the empty-chain `400` refusal (`activeChainOrThrow`), `auto:<name>` exposure in `GET /v1/models`, and `profiles.auto_include_new_models`, with the authoritative empty-chain commits `9961ab32`, `b2760fee`, `d4318697`, `06efa5ff`.

## 2026-08-23 â€” Prerequisite history

- **9961ab32** Make a fallback chain mean itself, empty or not (#1023)
- **b2760fee** Let a fallback chain be built by hand and stay that way (#1004)
- **d4318697** Add a named chain manager to the Fallback page (#988)
- **06efa5ff** List named fallback chains as `auto:<name>` models (#986)
