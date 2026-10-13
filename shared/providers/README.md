# Provider catalog

One file, one direction of truth:

- **`shared/providers/platforms.ts`** — the ONE hand-edited file: the provider
  list (platform id, display label, signup URL, keyless). The Keys page imports
  it directly. Routing behavior and base URLs live in the server registry
  (`server/src/providers/`); budget/model data lives in the DB.

## Why one list

Three places used to each carry part of the provider picture, and none carried
all of it:

| Source | Had | Missing |
|---|---|---|
| `shared/providers/platforms.ts` (`PLATFORMS`) | display name, signup URL, keyless | base URL, budgets, model counts |
| `server/src/providers/index.ts` (registry) | base URL, keyless, routing | display name, signup URL, budgets |
| `server/data/srouter.db` (`models.monthly_token_budget`) | budget per model | name, URL, keyless |

The Keys page counts **64** providers because `PLATFORMS` has 64 entries
(minus `custom` — no duplicates). The server registry covers all **64**, and the
DB carries models for **33** of them.

## Field reference

| Field | Source | Example |
|---|---|---|
| `value` | `Platform` union | `xkiro` |
| `label` | display name | `xKiro (free key)` |
| `url` | signup / key-management page | `https://xkiro.com` |
| `keyless` | usable without an API key | `true` |
