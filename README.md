<div align="center">

# 🚀 SRouter

### The Ultimate Free AI Gateway & Smart LLM Router

**Never hit rate limits again. Save tokens with prompt compression + auto-fallback to ~60 free AI providers and ~1,200+ models.**

**Connect all AI coding tools (Claude Code, Cursor, Windsurf, Cline, Codex, Copilot, Aider, OpenCode...) behind a single unified OpenAI-compatible endpoint.**

[![npm version](https://img.shields.io/npm/v/@baiibayu/srouter.svg?color=blue&logo=npm)](https://www.npmjs.com/package/@baiibayu/srouter)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.18.0-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Docker Ready](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](docs/en/install/01-install.md#docker-compose)
[![Desktop App](https://img.shields.io/badge/Desktop-Windows%20%7C%20macOS%20%7C%20Linux-blueviolet?logo=electron&logoColor=white)](desktop/)
[![i18n Locales](https://img.shields.io/badge/i18n-60%20Languages-orange)](client/src/i18n/locale-config.ts)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)
[![Sponsor](https://img.shields.io/badge/Sponsor-baiibayu-ea4aaa?logo=github-sponsors&logoColor=white)](#-support-the-developer)

<p align="center">
  <a href="#-quick-start"><b>⚡ Quick Start</b></a> •
  <a href="#-unified-api-endpoints--surfaces"><b>🔌 API Endpoints</b></a> •
  <a href="#-managing-web-engine-keys-web-tools-vs-providers"><b>🔑 Web Tools</b></a> •
  <a href="#️-mcp-server-setup--transport"><b>🛠️ MCP Setup</b></a> •
  <a href="#-why-srouter"><b>🤔 Why SRouter?</b></a> •
  <a href="#-how-it-works"><b>🔄 How It Works</b></a> •
  <a href="#-key-features"><b>✨ Key Features</b></a> •
  <a href="#-compatible-coding-agents--clis"><b>🤖 Coding Agents</b></a> •
  <a href="#-supported-providers"><b>🔌 Providers</b></a> •
  <a href="#-project-architecture"><b>🏗️ Architecture</b></a> •
  <a href="docs/en/README.md"><b>📚 Documentation</b></a>
</p>

<p align="center">
  <b>Language:</b>
  <a href="README.md"><b>🇺🇸 English</b></a> •
  <a href="README.id.md"><b>🇮🇩 Bahasa Indonesia</b></a> •
  <a href="README.zh-cn.md"><b>🇨🇳 简体中文</b></a> •
  <a href="README.ja.md"><b>🇯🇵 日本語</b></a>
</p>

<p align="center">
  <a href="docs/en/install/01-install.md#docker-compose"><img src="repo-assets/badges/docker.svg" height="42" alt="Self-host with Docker"></a>
<a href="https://github.com/baiibayu/srouter/releases/latest/download/SRouter-Setup-win.exe"><img src="repo-assets/badges/windows.svg" height="42" alt="Download for Windows"></a>
<a href="https://github.com/baiibayu/srouter/releases/latest/download/SRouter-mac-arm64.dmg"><img src="repo-assets/badges/macos-arm64.svg" height="42" alt="Download for macOS (Apple Silicon)"></a>
<a href="https://github.com/baiibayu/srouter/releases/latest/download/SRouter-mac-x64.dmg"><img src="repo-assets/badges/macos-x64.svg" height="42" alt="Download for macOS (Intel)"></a>
<a href="https://github.com/baiibayu/srouter/releases/latest/download/SRouter.AppImage"><img src="repo-assets/badges/linux.svg" height="42" alt="Download for Linux"></a>
</p>

![SRouter dashboard — live routing, monthly token budget, and usage stats](repo-assets/github-hero.png)

*Your router auto-syncs its model catalog twice daily from a signed feed: new models, quota updates, and provider quirk fixes arrive automatically without needing a `git pull`.*

</div>

---

## 🤔 Why SRouter?

Coding with AI agents (Claude Code, Cursor, Windsurf, Cline) is transformative, but developers constantly run into walls:

| ❌ The Headaches | ✅ The SRouter Solution |
| :--- | :--- |
| **Quota Waste & Expirations:** Monthly paid API allowances sit unused or expire at month-end. | **Maximize Every Token:** Intelligently drains active quotas first, then rotates across other providers. |
| **Sudden Rate Limits (429):** One heavy prompt or repeated tool call halts your workflow mid-coding. | **Smart 3-Tier Auto-Fallback:** Instant, seamless failover (Subscription → Budget → 100% Free Keyless) with zero downtime. |
| **Token Burning on Tool Outputs:** Long `git diff`, `grep`, test logs, and JSON outputs consume massive context windows. | **Prompt Compression & Token Saver:** Built-in heuristics and structure-aware filters compress noisy tool results, **typically saving 20–40% tokens**. |
| **SDK & API Fragmentation:** Juggling 50+ incompatible SDKs, auth formats, and endpoint URLs. | **One Universal `/v1` Gateway:** A single OpenAI-compatible base URL (`http://localhost:20268/v1`) that also natively handles Anthropic Messages (`/v1/messages`), Gemini (`/v1beta`), and Ollama emulation. |
| **Unpredictable Free Tiers:** Providers add, change, or deprecate free models every week. | **Self-Updating Catalog:** Pinned Ed25519 signed catalog auto-updates ~1,200+ models twice daily into your local SQLite DB. |
| **Privacy & Security Risks:** Sending API keys to cloud proxy providers exposes your credentials. | **100% Local & Encrypted:** Keys are stored locally using **AES-256-GCM** encryption; traffic proxies directly from your machine to upstream providers. |

![SRouter comparison vs OpenRouter, LiteLLM, and Portkey — one router, your keys, zero markup](repo-assets/comparison.png)

---

## 🔄 How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Your Coding Agents & IDEs                             │
│       (Claude Code, Cursor, Windsurf, Cline, Roo Code, Codex, Aider)        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ http://localhost:20268/v1
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SRouter Smart AI Gateway                            │
│  • Complexity Gate (System One: routes simple prompts fast, complex deep)  │
│  • Prompt Compressor & Token Saver (compacts tool results, trims context)  │
│  • Protocol Translation (OpenAI ↔ Anthropic Messages ↔ Gemini ↔ Ollama)     │
│  • Per-Key Rate Tracking (RPM / RPD / TPM / TPD tracking with auto-reset)   │
│  • Local AES-256-GCM Key Vault & SQLite Persistence                        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
 ┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
 │  Tier 1: Sub / Fast Key  │   │  Tier 2: Generous Quota  │   │ Tier 3: 100% Free / Anon │
 │  • Google Gemini 2.5     │   │  • Mistral / Codestral   │   │  • Kilo Gateway (No Key) │
 │  • Groq (Llama 3.3 70B)  │──►│  • Zhipu GLM-4 / CogView │──►│  • OpenCode Free (No Key)│
 │  • Pollinations (Free)   │   │  • Cloudflare Workers AI │   │  • OVH Endpoints (No Key)│
 │  • OpenRouter / DeepSeek │   │  • Cohere / NVIDIA NIM   │   │  • LLM7 / AI Horde       │
 └──────────────────────────┘   └──────────────────────────┘   └──────────────────────────┘
```

When a request arrives, SRouter evaluates model health, current RPM/RPD limits, and complexity. If an upstream provider returns `429 Too Many Requests` or `5xx Server Error`, the key enters a temporary cooldown, and SRouter **instantly retries the next best model in your fallback chain**.

![How SRouter routes one request through a live-scored fallback chain](repo-assets/router-flow.png)

---

## ⚡ Quick Start

Choose your preferred way to run SRouter:

### Option 1: Global CLI / NPX (Easiest)

Run SRouter anywhere Node 20+ is installed without cloning the repository:

```bash
# Install once
npm install -g @baiibayu/srouter
srouter

# Or run directly with npx — no install needed
npx @baiibayu/srouter
```

The Web Dashboard opens automatically at `http://localhost:20268`.

---

### Option 2: Docker Compose (Recommended for Servers & Home Labs)

```bash
# 1. Clone the repository
git clone https://github.com/baiibayu/srouter.git
cd srouter

# 2. Copy environment file and start container
cp .env.example .env
docker compose up -d
```

- **Dashboard:** `http://localhost:20268`
- **OpenAI Endpoint:** `http://localhost:20268/v1`

---

### Option 3: Desktop App (macOS & Windows)

Prefer a native application with a system tray menu?

1. Go to **[Releases](https://github.com/baiibayu/srouter/releases/latest)**.
2. Download the installer:
   - **Windows:** `SRouter-Setup-x.x.x.exe`
   - **macOS:** `SRouter-x.x.x-arm64.dmg` (Apple Silicon) or `x64.dmg` (Intel).
3. Launch the app. SRouter runs in your menu bar / system tray with a native popover showing live request stats and your unified API key.

---

### Option 4: Run from Source (Monorepo Development)

```bash
# 1. Clone repository
git clone https://github.com/baiibayu/srouter.git
cd srouter

# 2. Install dependencies & run database migrations
npm install
npm run db:migration:up

# 3. Start development server (Server :20268 + Client :5173 with HMR)
npm run dev
```

Open your browser and navigate to:
👉 **`http://localhost:20268`** (Web Dashboard).

---

## 🔌 Unified API Endpoints & Surfaces

All public gateway surfaces are unified under a single API key (`Bearer sr-xxx` or header `x-api-key: sr-xxx`). Retrieve your key anytime from the dashboard **Keys** tab.

### 🌐 Complete Endpoint Reference

| Method | Endpoint | Primary Surface | Description | Auth Header |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/v1/chat/completions` | **Chat Completions** | Full OpenAI-compatible chat surface. Supports streaming (`stream: true`), function/tool calling, vision, structured outputs, and automatic fallback routing. | `Bearer sr-xxx` |
| `POST` | `/v1/completions` | **Legacy Completions** | OpenAI legacy text completion endpoint (`object: "text_completion"`). Ideal for editor ghost-text code completion engines. | `Bearer sr-xxx` |
| `POST` | `/v1/responses` | **OpenAI Responses** | Native OpenAI Responses API wire format used by OpenAI Codex CLI (`wire_api="responses"`). | `Bearer sr-xxx` |
| `POST` | `/v1/messages` | **Anthropic Messages** | Native Anthropic Messages API wire format for Claude Code, Cursor (Anthropic mode), and Anthropic SDKs. Supports `/v1/messages/count_tokens`. | `Bearer sr-xxx` or `x-api-key: sr-xxx` |
| `POST` | `/v1/search` | **Web Search** | Unified web search routed across keyless Parallel Search or configured search providers (Tavily, Exa, Firecrawl, Linkup). | `Bearer sr-xxx` |
| `GET` | `/v1/search/engines` | **Web Search** | Lists configured and enabled search engines along with availability and quotas. | `Bearer sr-xxx` |
| `POST` | `/v1/decision` | **Decision (System One)** | Low-latency decision classification (TypeSafe contract) evaluating `state` and choice `questions`. 3-tier resolution: remote Jev host → chat-judge fallback → fail-open heuristic. | `Bearer sr-xxx` |
| `POST` | `/v1/decisions` | **Decisions** | Multiclass rubric decision models (Cloudflare Clef Flash, OpenRouter Mercury Decide). | `Bearer sr-xxx` |
| `GET` | `/v1/decisions/models` | **Decisions** | Lists available decision-scoring models. | `Bearer sr-xxx` |
| `POST` | `/v1/fetch` | **Page Fetch** | Fetches clean, readable web content from URLs (HTML boilerplate stripped). Falls back through TinyFish Fetch and keyless Jina Reader. | `Bearer sr-xxx` |
| `GET` | `/v1/fetch/sources` | **Page Fetch** | Lists fetch reader sources (`tinyfish-fetch`, `jina-reader`) with live configuration status. | `Bearer sr-xxx` |
| `GET` | `/v1/models` | **Model Discovery** | OpenAI-compatible catalog listing all active models, fallback aliases (`auto`, `auto:fast`, `auto:smart`, `auto:cheap`), and Anthropic model negotiation. | `Bearer sr-xxx` |
| `POST` | `/v1/embeddings` | **Embeddings** | Generates text embedding vectors across configured providers. | `Bearer sr-xxx` |
| `POST` | `/v1/images/generations` | **Image Media** | Multimodal image generation routed through the media catalog. | `Bearer sr-xxx` |
| `POST` | `/v1/audio/speech` | **Audio Media** | Text-to-speech audio synthesis. | `Bearer sr-xxx` |
| `POST` | `/v1beta/models/*:generateContent` | **Gemini Native** | Native Google Gemini API wire format for Gemini CLI and native Google SDKs. | `Bearer sr-xxx` or `x-goog-api-key` |
| `POST` | `/mcp` | **MCP Server** | Model Context Protocol over Streamable HTTP (stateless JSON-RPC). | `Bearer sr-xxx` |
| `GET` | `/v1/docs` | **API Reference** | Self-contained, dependency-free interactive API reference viewer. | *None (Public)* |
| `GET` | `/v1/openapi.json` | **OpenAPI Spec** | Full OpenAPI 3.0 specification for tools and code generation. | *None (Public)* |

---

### 🔍 Surface Details & Capabilities

1. **`chat/completions` (OpenAI Wire Format)**
   - The primary gateway surface. Route requests dynamically by setting `model: "auto"` (or `"auto:fast"`, `"auto:smart"`, `"auto:cheap"`), or target specific providers/models directly.
   - Transparently handles tool calling, streaming chunk delivery, vision input, and automatic fallback on 429/5xx errors.

2. **`responses` (Codex CLI Support)**
   - Implements the OpenAI Responses API wire format required by `codex-cli`.
   - Allows OpenAI Codex agents to run against open and free model tiers without protocol errors.

3. **`anthropic` (Messages API `/v1/messages`)**
   - Full native translation for Anthropic Messages API.
   - Claude Code (`claude-code`) and Anthropic SDKs can target `http://localhost:20268` directly.
   - Includes `/v1/messages/count_tokens` for precise client token management.

4. **`search` (Unified Web Search)**
   - Query the web through `POST /v1/search` with JSON payload `{"query": "your topic", "engine": "auto"}`.
   - Automatically utilizes 100% free keyless **Parallel Search**, or falls back across paid/freemium engines (**Tavily**, **Exa**, **Firecrawl**, **Linkup**).

5. **`decision` (System One Fast Classifier)**
   - Implements the TypeSafe System One decision contract (`POST /v1/decision`).
   - Evaluates context `state` against typed `choice` criteria (up to 255 options, scores 2..10).
   - Features 3-tier resilient resolution:
     - **Remote Jev Host:** Fast remote decision evaluation (< 2000ms). Source: `"jev"`.
     - **Chat-Judge Fallback:** Lightweight non-streaming judgment using the first active provider key in `decision_chat_judge_order` (default: Groq → Google → OpenRouter → Mistral), picking lightweight catalog models (8b, 7b, nano, mini, flash). Budget: 2500ms. Source: `"chatJudge"`.
     - **Fail-Open Local Heuristic:** Instant local scoring fallback (`scoreChoice`) guaranteeing zero downtime and no 5xx errors for downstream agents. Source: `"heuristic"`.

6. **`fetch` (Clean Page Extraction)**
   - Request clean markdown/text content for any public HTTP/HTTPS URL via `POST /v1/fetch` with `{"url": "https://..."}`.
   - Automatically guards against SSRF / internal subnet probing.
   - Falls back across configured readers: **TinyFish Fetch** and keyless **Jina Reader**. Inspect active readers via `GET /v1/fetch/sources`.

7. **`models` (Catalog & Discovery)**
   - Discovers all active, enabled models and synthetic router profiles.
   - Supports HTTP content negotiation: returns Anthropic-shaped model arrays when `anthropic-version` header is present, and OpenAI-shaped lists otherwise.

---

## 🔑 Managing Web Engine Keys (Web Tools vs Providers)

> [!IMPORTANT]
> **Where do Search and Fetch API keys go?**
>
> Keys for Web Tools (**Tavily**, **Exa**, **Firecrawl**, **Linkup**, **TinyFish Fetch**) **do not belong in the general LLM Provider list** because they do not serve chat completions.
>
> 1. In the Dashboard, navigate to the **Keys** tab.
> 2. Locate the **Web Tools** section (or the **Web Search** & **Web Fetch** cards).
> 3. Enter your keys directly in their dedicated cards.
> 4. Keyless engines (**Parallel Search**, **Jina Reader**) work automatically out of the box with zero configuration!

---

## 🛠️ MCP Server Setup & Transport

SRouter provides a built-in **Model Context Protocol (MCP)** server over **Streamable HTTP** (stateless HTTP POST to `/mcp`), adhering to protocol revision `2025-06-18`.

MCP allows coding assistants like Claude Desktop, Cursor, Cline, and Roo Code to query the router's live model availability, monitor quotas, inspect compression statistics, and switch routing strategies dynamically during a session.

### Transport Specification
- **Transport:** Stateless Streamable HTTP (`POST http://localhost:20268/mcp`). Single JSON-RPC 2.0 responses without complex multi-session overhead.
- **Authentication:** Unified API key sent as `Authorization: Bearer sr-xxx` or `x-api-key: sr-xxx`.

### Configuration Examples

#### 1. Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "srouter": {
      "url": "http://localhost:20268/mcp",
      "headers": {
        "Authorization": "Bearer sr-your-unified-key"
      }
    }
  }
}
```

#### 2. Cursor / Cline / Windsurf MCP
Add an HTTP / SSE MCP server in your tool's settings:
- **Server Name:** `srouter`
- **Server URL:** `http://localhost:20268/mcp`
- **HTTP Headers:** `Authorization: Bearer sr-your-unified-key`

### Available MCP Tools
- `list_models`: Lists active and available LLM models and supported sampling parameters.
- `check_health`: Returns real-time health and cooldown status of upstream providers.
- `get_routing_scores`: Inspects bandit scores and latency metrics across models.
- `set_routing_strategy`: Dynamically switches the active strategy (`auto`, `auto:fast`, `auto:smart`, `auto:cheap`).
- `get_cache_stats` & `clear_cache`: Monitors prompt cache hit rates and saved token metrics.
- `get_compression_stats`: Displays token savings achieved by the prompt compression engine.
- `get_quota_outlook`: Returns projected monthly quota exhaustion and provider limits.
- `ask_srouter`: Non-streaming fallback inference utility for MCP clients.

---

## 🛡️ Reliability & Fault Tolerance Defaults

- **Circuit Breaker OFF by Default (`0`):** SRouter is designed for aggressive multi-provider fallback. The global circuit breaker threshold defaults to `0` (disabled) so that intermittent 429s or transient upstream timeouts cool down only that specific key/model while immediately routing requests to alternate providers, rather than tripping an entire gateway shutdown.
- **SSE Keepalive:** Server-Sent Events (SSE) connections across OpenAI, Anthropic, and Responses routes transmit periodic heartbeat comments (`: keepalive\n\n`) to prevent intermediate reverse proxies (Nginx, Cloudflare) and NAT firewalls from dropping connections during long model reasoning turns, without HTTP header regressions.
- **Coherent Time Budgets:** Attempt budgets align per-hop timeouts with overall streaming durations to prevent premature connection cancellations.

---

## 🤖 Compatible Coding Agents & CLIs

SRouter includes automated configuration generators (`setup-*`) that inspect your live model catalog, back up existing settings, and write the exact configuration your tool expects:

<div align="center">

<table>
<tr>
<td align="center"><img src="repo-assets/agents/claude-code.png" width="64" alt="Claude Code"><br/><b>Claude Code</b></td>
<td align="center"><img src="repo-assets/agents/cursor.png" width="64" alt="Cursor"><br/><b>Cursor</b></td>
<td align="center"><img src="repo-assets/agents/codex.png" width="64" alt="Codex CLI"><br/><b>Codex CLI</b></td>
<td align="center"><img src="repo-assets/agents/cline.png" width="64" alt="Cline"><br/><b>Cline</b></td>
<td align="center"><img src="repo-assets/agents/continue.png" width="64" alt="Continue"><br/><b>Continue</b></td>
<td align="center"><img src="repo-assets/agents/aider.png" width="64" alt="Aider"><br/><b>Aider</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/agents/opencode.png" width="64" alt="OpenCode"><br/><b>OpenCode</b></td>
<td align="center"><img src="repo-assets/agents/gemini-cli.png" width="64" alt="Gemini CLI"><br/><b>Gemini CLI</b></td>
<td align="center"><img src="repo-assets/agents/roo-code.png" width="64" alt="Roo Code"><br/><b>Roo Code</b></td>
<td align="center"><img src="repo-assets/agents/kilo-code.png" width="64" alt="Kilo Code"><br/><b>Kilo Code</b></td>
<td align="center"><img src="repo-assets/agents/zed.png" width="64" alt="Zed"><br/><b>Zed</b></td>
<td align="center"><img src="repo-assets/agents/jetbrains.png" width="64" alt="JetBrains"><br/><b>JetBrains</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/agents/goose.png" width="64" alt="Goose"><br/><b>Goose</b></td>
<td align="center"><img src="repo-assets/agents/qwen-code.png" width="64" alt="Qwen Code"><br/><b>Qwen Code</b></td>
<td align="center"><img src="repo-assets/agents/crush.png" width="64" alt="Crush"><br/><b>Crush</b></td>
<td align="center"><img src="repo-assets/agents/factory-droid.png" width="64" alt="Factory Droid"><br/><b>Factory Droid</b></td>
<td align="center"><img src="repo-assets/agents/openclaw.png" width="64" alt="OpenClaw"><br/><b>OpenClaw</b></td>
<td align="center"><img src="repo-assets/agents/deepseek-harness.png" width="64" alt="DeepSeek Harness"><br/><b>DeepSeek Harness</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/agents/oh-my-pi.png" width="64" alt="Oh My Pi"><br/><b>Oh My Pi</b></td>
<td align="center"><img src="repo-assets/agents/hermes-agent.png" width="64" alt="Hermes"><br/><b>Hermes</b></td>
<td align="center"><img src="repo-assets/agents/pi.png" width="64" alt="Pi"><br/><b>Pi</b></td>
<td align="center"><img src="repo-assets/agents/atomcode.png" width="64" alt="AtomCode"><br/><b>AtomCode</b></td>
<td align="center"><img src="repo-assets/agents/reasonix.png" width="64" alt="Reasonix"><br/><b>Reasonix</b></td>
</tr>
</table>

</div>



```bash
# Automatic setup with your SRouter instance
srouter setup-claude --url http://localhost:20268 --api-key <your-unified-key>
```

_Not installed? Run the same command with `npx @baiibayu/srouter` in place of `srouter`._

| Coding Tool | Setup Command | Target Base URL | Native Wire Support |
| :--- | :--- | :--- | :--- |
| **Claude Code** | `srouter setup-claude` or `srouter launch` | `http://localhost:20268` | Native `/v1/messages` Anthropic format |
| **Cursor / Windsurf** | `srouter setup-cursor` (or manual) | `http://localhost:20268/v1` | OpenAI Chat Completions |
| **Cline** | `srouter setup-cline` | `http://localhost:20268/v1` | OpenAI / Anthropic format |
| **Roo Code / Kilo** | `srouter setup-roo` / `setup-kilo` | `http://localhost:20268/v1` | OpenAI Chat Completions |
| **Codex CLI** | `srouter setup-codex` or `srouter launch-codex` | `http://localhost:20268/v1` | Native `/v1/responses` format |
| **Aider** | `srouter setup-aider` | `http://localhost:20268/v1` | OpenAI Chat Completions |
| **Continue.dev** | `srouter setup-continue` | `http://localhost:20268/v1` | Chat + Ghost-text completions |
| **OpenCode** | `srouter setup-opencode` | `http://localhost:20268/v1` | OpenAI Chat Completions |
| **Gemini CLI** | Native `/v1beta` | `http://localhost:20268` | Native `generateContent` format |
| **Zed / JetBrains AI** | Ollama Emulation | `http://localhost:20268` | Native NDJSON Ollama API |

<details>
<summary><b>View Quick Tool Config Snippets (Click to expand)</b></summary>

### Claude Code Zero-Persistence Launch
```bash
# Injects credentials directly into child process without writing keys to disk
srouter launch
```


### Cursor / Windsurf Settings
```json
{
  "openai.baseUrl": "http://localhost:20268/v1",
  "openai.apiKey": "srouter-your-unified-key",
  "openai.model": "auto"
}
```

### Python OpenAI SDK
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:20268/v1",
    api_key="srouter-your-unified-key",
)

response = client.chat.completions.create(
    model="auto:smart",  # or "auto:fast", "auto", or specific model ID
    messages=[{"role": "user", "content": "Explain async/await in TypeScript."}],
)

print(response.choices[0].message.content)
print("Served via:", response.headers.get("x-routed-via"))
```

</details>

---

## 🔌 Supported Providers

SRouter aggregates **~60 providers** and **~1,200+ endpoints** behind one `/v1` endpoint.

![The free tier stacked — ~60 providers, ~1,200+ free model endpoints, ~900+ model families](repo-assets/free-tier.png)

<div align="center">

<table>
<tr>
<td align="center"><img src="repo-assets/providers/google.png" width="64" alt="Google Gemini"><br/><b>Google Gemini</b></td>
<td align="center"><img src="repo-assets/providers/groq.png" width="64" alt="Groq"><br/><b>Groq</b></td>
<td align="center"><img src="repo-assets/providers/mistral.png" width="64" alt="Mistral"><br/><b>Mistral</b></td>
<td align="center"><img src="repo-assets/providers/openrouter.png" width="64" alt="OpenRouter"><br/><b>OpenRouter</b></td>
<td align="center"><img src="repo-assets/providers/alibaba.png" width="64" alt="Alibaba Qwen"><br/><b>Alibaba Qwen</b></td>
<td align="center"><img src="repo-assets/providers/nous.png" width="64" alt="Nous Research"><br/><b>Nous Research</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/providers/siliconflow.png" width="64" alt="SiliconFlow"><br/><b>SiliconFlow</b></td>
<td align="center"><img src="repo-assets/providers/modelscope.png" width="64" alt="ModelScope"><br/><b>ModelScope</b></td>
<td align="center"><img src="repo-assets/providers/cloudflare.png" width="64" alt="Cloudflare"><br/><b>Cloudflare</b></td>
<td align="center"><img src="repo-assets/providers/cohere.png" width="64" alt="Cohere"><br/><b>Cohere</b></td>
<td align="center"><img src="repo-assets/providers/zhipu.png" width="64" alt="Zhipu GLM"><br/><b>Zhipu GLM</b></td>
<td align="center"><img src="repo-assets/providers/nvidia.png" width="64" alt="NVIDIA NIM"><br/><b>NVIDIA NIM</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/providers/baidu.png" width="64" alt="Baidu Qianfan"><br/><b>Baidu Qianfan</b></td>
<td align="center"><img src="repo-assets/providers/bytedance.png" width="64" alt="ByteDance Ark"><br/><b>ByteDance Ark</b></td>
<td align="center"><img src="repo-assets/providers/iflytek.png" width="64" alt="iFlytek Spark"><br/><b>iFlytek Spark</b></td>
<td align="center"><img src="repo-assets/providers/amd.png" width="64" alt="AMD Radeon"><br/><b>AMD Radeon</b></td>
<td align="center"><img src="repo-assets/providers/huggingface.png" width="64" alt="HuggingFace"><br/><b>HuggingFace</b></td>
<td align="center"><img src="repo-assets/providers/kilo.png" width="64" alt="Kilo"><br/><b>Kilo</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/providers/llm7.png" width="64" alt="LLM7"><br/><b>LLM7</b></td>
<td align="center"><img src="repo-assets/providers/ollama.png" width="64" alt="Ollama"><br/><b>Ollama</b></td>
<td align="center"><img src="repo-assets/providers/ovh.png" width="64" alt="OVH"><br/><b>OVH</b></td>
<td align="center"><img src="repo-assets/providers/pollinations.png" width="64" alt="Pollinations"><br/><b>Pollinations</b></td>
<td align="center"><img src="repo-assets/providers/opencode.png" width="64" alt="OpenCode"><br/><b>OpenCode</b></td>
<td align="center"><img src="repo-assets/providers/aihorde.png" width="64" alt="AI Horde"><br/><b>AI Horde</b></td>
</tr>
</table>

</div>

### 1. ⚡ 100% Free / Keyless (No Sign-up / Credit Card Needed)
| Provider | Available Free Models | Notes |
| :--- | :--- | :--- |
| **Kilo Gateway** | Kilo Auto Free, Nemotron-3 Ultra Free | Zero signup needed, completely anonymous |
| **OpenCode Free** | OpenCode Tier Models | Built-in free inference pool |
| **OVH AI Endpoints** | Qwen3Guard, Stable Diffusion, Whisper TTS | 2 RPM anonymous keyless tier |
| **LLM7** | Codestral, Mistral-Nemo, Gemma 4, GPT-OSS | Generous rolling daily allowance |
| **AI Horde** | Community LLaMA, Qwen, Gemma, Mistral | Kudos-based community distributed pool |

### 2. 🌐 Generous Free Tier with API Key
- **Google AI Studio:** Gemini 2.5 Flash / Pro (Generous free daily requests)
- **Groq:** Ultra-fast Llama 3.3 70B & Mixtral (30 RPM free tier)
- **Pollinations:** Free text + image generation (no key needed)
- **Mistral AI:** Codestral, Mistral Small, Embeddings
- **Cloudflare Workers AI:** 10,000 neurons/day free tier
- **Cohere:** Command R / Command R+ trial credits
- **Zhipu AI (Z.ai):** GLM-4 and visual models
- **NVIDIA NIM:** 1,000 free API trial calls across open frontier models

### 3. 🌏 Regional & High Quota Gateways
- **ModelScope (Aliyun):** Qwen3.8, DeepSeek V4 Pro, GLM-5.2 (2,000 req/day free)
- **Baidu Qianfan & Volcengine Ark:** DeepSeek & Doubao free tiers
- **NaraRouter:** Indonesian & Southeast Asian low-latency AI endpoints
- **Sea-Lion:** Southeast Asian specialized multilingual models

### 4. 🔌 Custom Local & Remote Providers
Connect local models from **Ollama**, **LM Studio**, **vLLM**, or **llama.cpp** directly via the Keys page in the dashboard.

---

## 🏗️ Project Architecture

SRouter is built as a modular, high-performance monorepo:

```
srouter/
├── cli/                 ← CLI tools & agent auto-generators (`srouter setup-*`)
├── client/              ← Admin Dashboard (React + Vite + Tailwind + Lucide, 60 locales)
├── desktop/             ← Electron desktop app (macOS / Windows tray popover)
├── docker/              ← Dockerfile & container runtime configurations
├── docs/                ← Comprehensive multi-language documentation & API references
│   ├── en/              ← English guides & architecture documentation
│   ├── zh-cn/           ← Chinese documentation
│   └── README.md        ← Documentation navigation hub
├── repo-assets/         ← Brand logos, architecture flows, and UI screenshots
├── scripts/             ← Automated bootstrap, dev tests, and release helpers
├── server/              ← Gateway engine (Node.js + TypeScript + SQLite)
│   ├── src/
│   │   ├── db/          ← SQLite database, migrations, and model catalog seed
│   │   ├── providers/   ← 60+ upstream provider adapters & wire protocols
│   │   ├── routes/      ← OpenAI, Anthropic, Gemini, Ollama & admin API routes
│   │   ├── services/    ← Bandit scoring, quota tracker, crypto vault, token saver
│   │   └── index.ts     ← Main gateway server entry point
├── shared/              ← Shared TypeScript types, schemas, and catalog definitions
├── CONTRIBUTING.md      ← Contributor onboarding, testing guide & PR policies
├── LICENSE              ← Open-source MIT License
└── package.json         ← Monorepo workspaces definition
```

---

## ✨ Key Features

![SRouter feature overview — smart routing, automatic failover, fusion, analytics, multi-protocol](repo-assets/features.png)

**Do I need a password?** Not for the desktop app — the dashboard signs itself in with a hidden local account, so there is nothing to set up and nothing to forget. Open it from the tray icon → **Open Dashboard**, or in any browser on the same computer (for example http://127.0.0.1:31415); both sign in on their own. Another device reaching the app over LAN access still sees the sign-in form. Server installs (Docker, one-liner, `npm run dev`) do have an email + password account.

- **Multi-Wire Protocol Translation:**
  - Full OpenAI surface (`/v1/chat/completions`, `/v1/models`, `/v1/embeddings`, `/v1/images/generations`, `/v1/audio/*`).
  - Native Anthropic Messages API (`/v1/messages`) for seamless Claude Code support.
  - Native Google Gemini API (`/v1beta/models/*:generateContent`).
  - Native Ollama Emulation for local-first IDEs like Zed and JetBrains AI.
  - Native Codex CLI `/v1/responses` support.
- **Prompt Compression Pipeline:**
  - Fail-open structure-aware & regex compression filters bloated tool results (`git diff`, file reads, shell stdout).
  - Compacts repeated JSON structures and removes stale conversational context to **typically save 20–40% tokens**.
- **Six Intelligent Routing Strategies:**
  - `auto`: Automatically balances speed, intelligence, and provider quota.
  - `auto:fast`: Prioritizes ultra-low latency providers (Groq).
  - `auto:smart`: Routes to highest capability models (Gemini 2.5 Pro, Codestral).
  - `auto:cheap`: Conserves premium quotas by routing to lightweight free endpoints.
  - `auto:<profile>`: Custom named fallback chains created in the dashboard.
- **Fusion Multi-Model Synthesis:**
  - Request virtual model `fusion`: fans prompt out to multiple diverse models in parallel; a judge model synthesizes one optimal final response.
- **Complexity Gate (System One):**
  - Heuristic pre-routing analyzer classifies prompt complexity: sends simple tasks to lightweight instant models and deep multi-step code to heavy models.
- **Built-in MCP Server (`/mcp`):**
  - Connects SRouter directly to ChatGPT, Claude Desktop, and MCP-compatible agents with model inspection and live health monitoring tools.
- **Zero-Exposure Local Security:**
  - Upstream provider keys are encrypted using **AES-256-GCM** inside local SQLite.
  - Your agents only ever see your unified `srouter-...` bearer token.
- **60 Languages Supported:**
  - Dashboard auto-detects browser locale with full RTL support (Arabic, Hebrew, Persian, Urdu).

---

## 🛠️ Command Reference

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts server (:20268) and web client (:5173) with hot reload |
| `npm run dev:lan` | Starts development server accessible across local network (LAN) |
| `npm run build` | Compiles server, CLI, and client packages for production |
| `npm test` | Runs complete test suite (unit tests, bootstrap tests, hooks) |
| `npm run lint` | Runs TypeScript and ESLint checks across packages |
| `npm run db:migration:up` | Runs all pending SQLite database migrations |
| `npm run db:migration:down` | Rolls back the latest database migration |
| `npm run db:migration:create --name=<n>` | Generates a new database migration file |
| `npm run desktop:dev` | Runs desktop application in development mode |
| `npm run desktop:dist:win` | Builds Windows desktop installer (`.exe`) |
| `npm run desktop:dist:mac:x64` | Builds macOS Intel installer (`.dmg`) |

---

## 🖼️ Dashboard Preview

<div align="center">

### Dynamic Model Fallback & Intelligence Scoring
![Models Page](repo-assets/models.png)

### Encrypted Key Vault & Quota Health
![Keys Page](repo-assets/keys.png)

### Interactive Multimodal Playground
![Playground Page](repo-assets/playground.png)

### Real-Time Latency & Token Analytics
![Analytics Page](repo-assets/analytics.png)

</div>

---

## ⚠️ Troubleshooting & FAQ

### 1. Port 20268 is already in use
Change the port via `.env` or CLI flag:
```bash
srouter serve --port 20270
```

### 2. Upstream returns 429 Too Many Requests
SRouter automatically cools down that key/provider and routes the request to the next model in your fallback chain. If all keys for that model are exhausted, configure a fallback chain in the **Models** tab or enable keyless free providers (Kilo, OpenCode Free).

### 3. Forgot the Dashboard Password?
Click **"Forgot password?"** on the login screen. Since SRouter is local-first, the one-time reset code is printed directly to the server console log:
```bash
# Docker users:
docker compose logs -f srouter

# Source / Desktop users:
# Look for the 6-digit reset code in terminal stdout or ~/.srouter/logs/srouter.log
```

### 4. Where is my database and data stored?
- **Global CLI / Source:** `~/.srouter/srouter.db`
- **Docker:** Named volume mounted to `/app/server/data`
- **Windows Desktop:** `%APPDATA%\SRouter\srouter.db`
- **macOS Desktop:** `~/Library/Application Support/SRouter/srouter.db`

---

## 🤝 Contributing

Contributions are warmly welcomed! Whether you want to add a new free provider, optimize the prompt compression pipeline, or improve translations:

1. Check out our **[Contributing Guidelines (CONTRIBUTING.md)](CONTRIBUTING.md)**.
2. Read our **[Code of Conduct (CODE_OF_CONDUCT.md)](CODE_OF_CONDUCT.md)**.
3. Review our **[Security Policy (SECURITY.md)](SECURITY.md)**.

---

## ❤️ Support the Developer

If SRouter saves you money, boosts your coding flow, or helps your workflow, consider supporting development. Every coffee keeps this project alive and independent!

[![Trakteer](https://img.shields.io/badge/Trakteer-e11d48?style=for-the-badge&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI%2BPHBhdGggZmlsbD0id2hpdGUiIGQ9Ik00IDRoMTZ2M2gtNi41djExaC0zVjdINFY0eiIvPjwvc3ZnPg%3D%3D&logoColor=white)](https://trakteer.id/baiibayu/tip)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/baiibayu)
[![PayPal](https://img.shields.io/badge/PayPal-0070BA?style=for-the-badge&logo=paypal&logoColor=white)](https://www.paypal.me/baiibayu)

---

## 📄 License & Disclaimer

- **License:** Open-source under the [MIT License](LICENSE).
- **Disclaimer:** SRouter is designed for personal development, experimentation, and coding agent enhancement. Free tiers are governed by the terms of service of each respective upstream provider. For mission-critical production workloads, we recommend using official enterprise paid endpoints.

<div align="center">
<sub>Crafted with passion by <b><a href="https://github.com/baiibayu">@baiibayu</a></b> & community contributors.</sub>
</div>
