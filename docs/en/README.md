<div align="center">

# 📖 SRouter Documentation

### Developer Guides, API Specifications, and Architectural References

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](../../LICENSE)
[![OpenAI Compatible](https://img.shields.io/badge/API-OpenAI%20%7C%20Anthropic%20%7C%20Gemini-blue)](api/01-rest-api.md)
[![Agents](https://img.shields.io/badge/Agents-Claude%20%7C%20Cursor%20%7C%20Cline%20%7C%20Codex-purple)](clients/01-agent-clients.md)

<p align="center">
  <b>Language:</b><br/>
  <a href="README.md"><b>🇺🇸 English</b></a> •
  <a href="../id/README.md"><b>🇮🇩 Bahasa Indonesia</b></a> •
  <a href="../zh-cn/README.md"><b>🇨🇳 简体中文</b></a>
</p>

</div>

---

## 🧭 Welcome to SRouter Docs

This documentation hub covers everything you need to install, configure, and operate the SRouter smart AI gateway. SRouter turns dozens of free provider tiers into a unified, high-availability, local-first inference infrastructure.

---

## 📚 Documentation Tracks

### 🚀 1. Installation & Deployment
- **[Installation Guide](install/01-install.md):** Detailed guide for NPX / Global CLI, Docker Compose, production server builds, and LAN configuration.
- **[Desktop Application](../../desktop/README.md):** Menu-bar / system tray Electron application for macOS and Windows.
- **[Android with Termux](install/02-android-termux.md):** Run SRouter locally on Android devices using Node's built-in SQLite driver.
- **[Docker Deployment](../../docker/README.md):** Container volumes, security flags, and persistent data paths.

### 🤖 2. Coding Agents & IDE Integration
- **[Client Integration Guide](clients/01-agent-clients.md):**
  - **Claude Code:** Native `/v1/messages` integration and zero-persistence secret injection (`srouter launch`).
  - **Cursor & Windsurf:** Connecting via unified base URL and `auto` routing.
  - **Cline & Roo Code:** Multi-model fallback configuration.
  - **Codex CLI:** Native `/v1/responses` format mapping.
  - **Zed & JetBrains AI:** Emulated Ollama wire endpoints.
  - **ChatGPT Secure MCP Tunnel:** Using SRouter as an MCP inference provider over `/mcp`.
- **[Client Profiles](clients/02-client-profiles.md):** Enforcing custom system prompts, token rules, and sampling params per client.

### 📡 3. API & Wire Protocols
- **[REST API Reference](api/01-rest-api.md):**
  - OpenAI Chat Completions (`/v1/chat/completions`)
  - Anthropic Messages API (`/v1/messages`)
  - Google Gemini API (`/v1beta/models/*:generateContent`)
  - Ollama Emulation (`/api/chat`, `/api/generate`)
  - Text Embeddings (`/v1/embeddings`)
  - Media Generation (`/v1/images/generations`, `/v1/audio/*`, `/v1/videos/*`)
  - Agent Web Search & Fetch (`/v1/web-search`, `/v1/fetch`)
- **[Idempotency & Retry Semantics](api/02-idempotency.md):** Request deduping and safe retries across distributed providers.

### ✂️ 4. Prompt Compression & Token Saver
- **[Compression Pipeline](compression/01-compression-pipeline.md):**
  - AST-based and heuristic output pruning for `git diff`, grep, and terminal output.
  - Compact repeated JSON structures to save **20–40% tokens per request**.
  - Context window trimming before routing to upstream providers.

### ⚡ 5. Routing Engine & Architecture
- **[Architecture Deep-Dive](architecture/00-high-level-index.md):**
  - High-level system design and failover mechanics.
  - [Multi-Bandit Scoring](architecture/01-routing-and-bandit-scoring.md): How models are ranked in real time by latency and capability.
  - [Quota & Cooldown Engine](architecture/02-quota-and-cooldown-engine.md): Tracking RPM/RPD/TPM per `(platform, model, key)`.
  - [Streaming Pipeline](architecture/03-streaming-pipeline.md): Low-latency SSE streaming pass-through and token parsing.
  - [Degraded Mode & Failover](architecture/04-degraded-mode-and-failover.md): Automatic key cooldowns and fallback cascades.
  - [Signed Catalog Sync](architecture/05-catalog-sync.md): How model metadata auto-updates via Ed25519 signed feeds.

### 🔒 6. Fallback Chains & Operational Management
- **[Named Fallback Chains](fallback/01-named-chains.md):** Creating and managing custom routing chains (`auto:<profile>`).
- **[Proxy Transports](proxy/OVERVIEW.md):** Outbound forward proxying vs Cloudflare Fetch Relay.
- **[Database Migrations](../../server/src/db/README.md):** Schema evolution and SQLite migration management.
- **[Contributor Guide](../../CONTRIBUTING.md):** Development loop, test expectations, and PR policies.

---

<div align="center">
<sub>Crafted with passion by <b>Bayu Indra Sugiharto (<a href="https://github.com/baiibayu">@baiibayu</a>)</b> & community contributors.</sub>
</div>
