<div align="center">

# 📚 SRouter Documentation Hub

**Comprehensive guides, API specifications, and architectural references for SRouter.**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](../LICENSE)
[![OpenAI Compatible](https://img.shields.io/badge/API-OpenAI%20%7C%20Anthropic%20%7C%20Gemini-blue)](en/api/01-rest-api.md)
[![Agents](https://img.shields.io/badge/Agents-Claude%20%7C%20Cursor%20%7C%20Cline%20%7C%20Codex-purple)](en/clients/01-agent-clients.md)

<p align="center">
  <b>Pilih Bahasa / Select Language:</b><br/>
  <a href="en/README.md"><b>🇺🇸 English Documentation</b></a> •
  <a href="id/README.md"><b>🇮🇩 Dokumentasi Bahasa Indonesia</b></a> •
  <a href="zh-cn/README.md"><b>🇨🇳 简体中文文档</b></a>
</p>

</div>

---

## 🧭 Documentation Roadmap

Welcome to the SRouter knowledge base. Whether you are connecting your first AI coding tool, deploying a local Docker gateway for your home lab, or building custom provider adapters, explore the structured guides below:

```
SRouter Docs
├── 🚀 1. Getting Started & Deployment
│   ├── Quick start (NPX / Global CLI)
│   ├── Docker Compose & Home Lab setup
│   ├── Desktop Menu-bar Application (Windows & macOS)
│   └── Android Termux (Local SQLite)
│
├── 🤖 2. Coding Agents & IDE Integration
│   ├── Claude Code (Native Messages & zero-persistence launch)
│   ├── Cursor & Windsurf (OpenAI base URL setup)
│   ├── Cline, Roo Code, & Kilo (Auto-configuration)
│   ├── Codex CLI (Native /v1/responses)
│   ├── Zed & JetBrains AI (Ollama emulation)
│   └── ChatGPT Private Secure MCP Tunnel (/mcp)
│
├── 📡 3. API Reference & Wire Protocols
│   ├── Chat Completions (/v1/chat/completions)
│   ├── Anthropic Messages (/v1/messages)
│   ├── Native Gemini (/v1beta/models/*:generateContent)
│   ├── Unified Web Search (/v1/search & /v1/search/engines)
│   ├── Page Fetch & Extraction (/v1/fetch & /v1/fetch/sources)
│   ├── Decision System One (/v1/decision & /v1/decisions)
│   ├── Model Context Protocol (/mcp Streamable HTTP)
│   ├── Ollama NDJSON Emulation
│   └── Multimodal & Media (Vision, TTS, Video)
│
├── ⚡ 4. Routing Engine & Optimization
│   ├── 6 Routing Strategies (auto, fast, smart, cheap, profile)
│   ├── Multi-Model Fusion (Panel synthesis)
│   ├── Complexity Gate (System One heuristic classifier)
│   └── Multi-Account Rate Tracking (RPM / RPD / TPM)
│
├── ✂️ 5. Prompt Compression & Token Saver
│   ├── Heuristic & Structure-Aware Tool Output Filter
│   ├── JSON Compaction & Context Trimming
│   └── Typical 20–40% Token Reduction
│
└── 🔒 6. Security & Architecture
    ├── Local AES-256-GCM Key Vault in SQLite
    ├── Signed Model Catalog Sync (Ed25519)
    └── ToS & Compliance Considerations
```

---

## 📑 Core Documentation Sections

| Section | Description | English Guide | Panduan Indonesia |
| :--- | :--- | :---: | :---: |
| **🚀 Installation & Deploy** | Step-by-step installation via CLI, Docker Compose, Desktop app, and source development. | [Read Guide →](en/install/01-install.md) | [Baca Panduan →](id/README.md#-instalasi--deployment) |
| **🤖 Coding Agents** | One-command recipes for Claude Code, Cursor, Windsurf, Cline, Codex, Aider, and Continue. | [Read Guide →](en/clients/01-agent-clients.md) | [Baca Panduan →](id/README.md#-integrasi-ai-coding-agents) |
| **📡 API Reference** | Complete endpoint specs for OpenAI, Anthropic, Gemini, and Ollama surfaces. | [Read Specs →](en/api/01-rest-api.md) | [Baca Spesifikasi →](id/README.md#-spesifikasi-api) |
| **✂️ Prompt Compression** | How SRouter compresses noisy terminal dumps, git diffs, and tool outputs. | [Read Pipeline →](en/compression/01-compression-pipeline.md) | [Baca Pipeline →](id/README.md#-kompresi-prompt--token-saver) |
| **⚡ Routing Architecture** | Multi-bandit scoring, fallback cooldowns, and auto-failover mechanics. | [Read Architecture →](en/architecture/00-high-level-index.md) | [Baca Arsitektur →](id/README.md#-arsitektur--keamanan) |
| **🔒 Fallback Chains** | Configuring custom failover priority and named fallback profiles. | [Read Guide →](en/fallback/01-named-chains.md) | [Baca Panduan →](id/README.md) |

---

## 🛠️ Contributor & Developer Resources

- **[CONTRIBUTING.md](../CONTRIBUTING.md):** Contributor loop, test expectations, and PR policies.
- **[Database Migrations](../server/src/db/README.md):** Managing SQLite migrations with Knex/custom drivers.
- **[Localization Guide](TRANSLATION.md):** Contributing translations across 60 supported locales.
- **[Security Policy](../SECURITY.md):** Reporting security issues and vulnerabilities responsibly.

---

<div align="center">
<sub>Need help or want to suggest a new provider? Open an issue on <a href="https://github.com/baiibayu/srouter/issues">GitHub Issues</a>.</sub>
</div>
