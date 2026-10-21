<div align="center">

# 🔌 Provider Catalog & Platform Registry

### Single Source of Truth for Upstream AI Providers

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Providers](https://img.shields.io/badge/Providers-~60%20Platforms-brightgreen)](platforms.ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/baiibayu/srouter/blob/main/LICENSE)

</div>

---

## 🧭 Architecture & Source of Truth

SRouter enforces a clean unidirectional architecture for AI provider definitions:

- **`shared/providers/platforms.ts` (`PLATFORMS`):** The single authoritative hand-edited registry containing platform IDs, user-facing display names, signup/dashboard URLs, and keyless availability.
- **`server/src/providers/`:** Implements wire protocol adapters, request mapping, error normalization, and streaming parsers.
- **`srouter.db` (`models` table):** Tracks token budgets, capability tiers, context windows, and real-time health scores.

---

## 📋 Field Reference (`platforms.ts`)

Each provider entry in `PLATFORMS` conforms to the following schema:

| Field | Type | Description | Example |
| :--- | :--- | :--- | :--- |
| `value` | `Platform` (union) | Unique lowercase identifier matching server adapter keys | `"groq"` |
| `label` | `string` | User-facing display title in dashboard and CLI tables | `"Groq (Llama 3.3 70B)"` |
| `url` | `string` | Official signup or API key management console | `"https://console.groq.com/keys"` |
| `keyless` | `boolean` | Indicates whether the provider can be used without an API key | `false` |

---

## ➕ Adding a New Provider

To register a new upstream LLM provider:

1. **Add entry to `shared/providers/platforms.ts`:** Append the platform definition with its slug, display name, and URL.
2. **Implement server adapter in `server/src/providers/`:** Create the wire protocol handler (e.g. mapping OpenAI-compatible or proprietary endpoints).
3. **Register models in DB migration:** Add seed models and default fallback priorities in a new migration under `server/src/db/migrations/`.
4. **Run tests:** Ensure the adapter passes test coverage (`npm test`).

---

## 📄 License

Open-source under the [MIT License](https://github.com/baiibayu/srouter/blob/main/LICENSE).
Crafted by **[@baiibayu](https://github.com/baiibayu)** & community contributors.
