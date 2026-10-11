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
# 1. Clone & install dependencies
git clone https://github.com/baiibayu/srouter.git
cd srouter
npm install

# 2. Apply database migrations
npm run db:migration:up

# 3. Start development server (Server :20268 + Client :5173 with HMR)
npm run dev
```

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

<a href="https://github.com/moaaz12-web"><img src="https://images.weserv.nl/?url=github.com/moaaz12-web.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@moaaz12-web" /></a>
<a href="https://github.com/lukasulc"><img src="https://images.weserv.nl/?url=github.com/lukasulc.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@lukasulc" /></a>
<a href="https://github.com/VinhPhamAI"><img src="https://images.weserv.nl/?url=github.com/VinhPhamAI.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@VinhPhamAI" /></a>
<a href="https://github.com/deadc"><img src="https://images.weserv.nl/?url=github.com/deadc.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@deadc" /></a>
<a href="https://github.com/zhangyu1324"><img src="https://images.weserv.nl/?url=github.com/zhangyu1324.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@zhangyu1324" /></a>
<a href="https://github.com/kentpan"><img src="https://images.weserv.nl/?url=github.com/kentpan.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@kentpan" /></a>
<a href="https://github.com/stephenzwj"><img src="https://images.weserv.nl/?url=github.com/stephenzwj.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@stephenzwj" /></a>
<a href="https://github.com/chongjiazhen"><img src="https://images.weserv.nl/?url=github.com/chongjiazhen.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@chongjiazhen" /></a>
<a href="https://github.com/vjsai"><img src="https://images.weserv.nl/?url=github.com/vjsai.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@vjsai" /></a>
<a href="https://github.com/long2ice"><img src="https://images.weserv.nl/?url=github.com/long2ice.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@long2ice" /></a>
<a href="https://github.com/sadesguy"><img src="https://images.weserv.nl/?url=github.com/sadesguy.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@sadesguy" /></a>
<a href="https://github.com/hodlmybeer69-bit"><img src="https://images.weserv.nl/?url=github.com/hodlmybeer69-bit.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@hodlmybeer69-bit" /></a>
<a href="https://github.com/phoenixikkifullstack"><img src="https://images.weserv.nl/?url=github.com/phoenixikkifullstack.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@phoenixikkifullstack" /></a>
<a href="https://github.com/jtbrennan-git"><img src="https://images.weserv.nl/?url=github.com/jtbrennan-git.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@jtbrennan-git" /></a>
<a href="https://github.com/praveenkumarpranjal"><img src="https://images.weserv.nl/?url=github.com/praveenkumarpranjal.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@praveenkumarpranjal" /></a>
<a href="https://github.com/nordbyte"><img src="https://images.weserv.nl/?url=github.com/nordbyte.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@nordbyte" /></a>
<a href="https://github.com/mybropro"><img src="https://images.weserv.nl/?url=github.com/mybropro.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@mybropro" /></a>
<a href="https://github.com/danscMax"><img src="https://images.weserv.nl/?url=github.com/danscMax.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@danscMax" /></a>
<a href="https://github.com/jhash"><img src="https://images.weserv.nl/?url=github.com/jhash.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@jhash" /></a>
<a href="https://github.com/JammyJames1234"><img src="https://images.weserv.nl/?url=github.com/JammyJames1234.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@JammyJames1234" /></a>
<a href="https://github.com/coffcoe"><img src="https://images.weserv.nl/?url=github.com/coffcoe.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@coffcoe" /></a>
<a href="https://github.com/Sumit4codes"><img src="https://images.weserv.nl/?url=github.com/Sumit4codes.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Sumit4codes" /></a>
<a href="https://github.com/meliani"><img src="https://images.weserv.nl/?url=github.com/meliani.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@meliani" /></a>
<a href="https://github.com/thedavidweng"><img src="https://images.weserv.nl/?url=github.com/thedavidweng.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@thedavidweng" /></a>
<a href="https://github.com/bharvey42"><img src="https://images.weserv.nl/?url=github.com/bharvey42.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@bharvey42" /></a>
<a href="https://github.com/yuvrxj-afk"><img src="https://images.weserv.nl/?url=github.com/yuvrxj-afk.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@yuvrxj-afk" /></a>
<a href="https://github.com/Tushar49"><img src="https://images.weserv.nl/?url=github.com/Tushar49.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Tushar49" /></a>
<a href="https://github.com/nicyoong"><img src="https://images.weserv.nl/?url=github.com/nicyoong.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@nicyoong" /></a>
<a href="https://github.com/Aldo-f"><img src="https://images.weserv.nl/?url=github.com/Aldo-f.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Aldo-f" /></a>
<a href="https://github.com/Tazrif-Raim"><img src="https://images.weserv.nl/?url=github.com/Tazrif-Raim.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Tazrif-Raim" /></a>
<a href="https://github.com/m1nuzz"><img src="https://images.weserv.nl/?url=github.com/m1nuzz.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@m1nuzz" /></a>
<a href="https://github.com/suantea"><img src="https://images.weserv.nl/?url=github.com/suantea.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@suantea" /></a>
<a href="https://github.com/OhOkThisIsFine"><img src="https://images.weserv.nl/?url=github.com/OhOkThisIsFine.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@OhOkThisIsFine" /></a>
<a href="https://github.com/LoneRifle"><img src="https://images.weserv.nl/?url=github.com/LoneRifle.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@LoneRifle" /></a>
<a href="https://github.com/ita333"><img src="https://images.weserv.nl/?url=github.com/ita333.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@ita333" /></a>
<a href="https://github.com/barbotkonv"><img src="https://images.weserv.nl/?url=github.com/barbotkonv.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@barbotkonv" /></a>
<a href="https://github.com/Naster17"><img src="https://images.weserv.nl/?url=github.com/Naster17.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Naster17" /></a>
<a href="https://github.com/StealthTensor"><img src="https://images.weserv.nl/?url=github.com/StealthTensor.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@StealthTensor" /></a>
<a href="https://github.com/EmranAhmed"><img src="https://images.weserv.nl/?url=github.com/EmranAhmed.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@EmranAhmed" /></a>
<a href="https://github.com/itsfuad"><img src="https://images.weserv.nl/?url=github.com/itsfuad.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@itsfuad" /></a>
<a href="https://github.com/RobinHoodO"><img src="https://images.weserv.nl/?url=github.com/RobinHoodO.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@RobinHoodO" /></a>
<a href="https://github.com/hmm183"><img src="https://images.weserv.nl/?url=github.com/hmm183.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@hmm183" /></a>
<a href="https://github.com/duemilionidieuro-bot"><img src="https://images.weserv.nl/?url=github.com/duemilionidieuro-bot.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@duemilionidieuro-bot" /></a>
<a href="https://github.com/cagedbird043"><img src="https://images.weserv.nl/?url=github.com/cagedbird043.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@cagedbird043" /></a>
<a href="https://github.com/jasnoorgill"><img src="https://images.weserv.nl/?url=github.com/jasnoorgill.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@jasnoorgill" /></a>
<a href="https://github.com/Joey9024"><img src="https://images.weserv.nl/?url=github.com/Joey9024.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Joey9024" /></a>
<a href="https://github.com/AskingConical"><img src="https://images.weserv.nl/?url=github.com/AskingConical.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@AskingConical" /></a>
<a href="https://github.com/ProAlit"><img src="https://images.weserv.nl/?url=github.com/ProAlit.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@ProAlit" /></a>
<a href="https://github.com/hjhhoni"><img src="https://images.weserv.nl/?url=github.com/hjhhoni.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@hjhhoni" /></a>
<a href="https://github.com/immanuelsavio"><img src="https://images.weserv.nl/?url=github.com/immanuelsavio.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@immanuelsavio" /></a>
<a href="https://github.com/Slyker"><img src="https://images.weserv.nl/?url=github.com/Slyker.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Slyker" /></a>
<a href="https://github.com/wells1013"><img src="https://images.weserv.nl/?url=github.com/wells1013.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@wells1013" /></a>
<a href="https://github.com/evgkrsk"><img src="https://images.weserv.nl/?url=github.com/evgkrsk.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@evgkrsk" /></a>
<a href="https://github.com/aaronjmars"><img src="https://images.weserv.nl/?url=github.com/aaronjmars.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@aaronjmars" /></a>
<a href="https://github.com/Robs87"><img src="https://images.weserv.nl/?url=github.com/Robs87.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Robs87" /></a>
<a href="https://github.com/dashitongzhi"><img src="https://images.weserv.nl/?url=github.com/dashitongzhi.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@dashitongzhi" /></a>
<a href="https://github.com/QingJ01"><img src="https://images.weserv.nl/?url=github.com/QingJ01.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@QingJ01" /></a>
<a href="https://github.com/3215"><img src="https://images.weserv.nl/?url=github.com/3215.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@3215" /></a>
<a href="https://github.com/saifulaiub123"><img src="https://images.weserv.nl/?url=github.com/saifulaiub123.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@saifulaiub123" /></a>
<a href="https://github.com/PietFourie"><img src="https://images.weserv.nl/?url=github.com/PietFourie.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@PietFourie" /></a>
<a href="https://github.com/mhmdkrmabd"><img src="https://images.weserv.nl/?url=github.com/mhmdkrmabd.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@mhmdkrmabd" /></a>
<a href="https://github.com/DemeulemeesterxMaxime"><img src="https://images.weserv.nl/?url=github.com/DemeulemeesterxMaxime.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@DemeulemeesterxMaxime" /></a>
<a href="https://github.com/HoodBlah"><img src="https://images.weserv.nl/?url=github.com/HoodBlah.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@HoodBlah" /></a>
<a href="https://github.com/SeanPedersen"><img src="https://images.weserv.nl/?url=github.com/SeanPedersen.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@SeanPedersen" /></a>
<a href="https://github.com/andersmmg"><img src="https://images.weserv.nl/?url=github.com/andersmmg.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@andersmmg" /></a>
<a href="https://github.com/chirag127"><img src="https://images.weserv.nl/?url=github.com/chirag127.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@chirag127" /></a>
<a href="https://github.com/allababbot"><img src="https://images.weserv.nl/?url=github.com/allababbot.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@allababbot" /></a>
<a href="https://github.com/johan-droid"><img src="https://images.weserv.nl/?url=github.com/johan-droid.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@johan-droid" /></a>
<a href="https://github.com/redenfire"><img src="https://images.weserv.nl/?url=github.com/redenfire.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@redenfire" /></a>
<a href="https://github.com/itzpingcat"><img src="https://images.weserv.nl/?url=github.com/itzpingcat.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@itzpingcat" /></a>
<a href="https://github.com/kairwang01"><img src="https://images.weserv.nl/?url=github.com/kairwang01.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@kairwang01" /></a>
<a href="https://github.com/gongjurenzhangwei"><img src="https://images.weserv.nl/?url=github.com/gongjurenzhangwei.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@gongjurenzhangwei" /></a>
<a href="https://github.com/jsonring"><img src="https://images.weserv.nl/?url=github.com/jsonring.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@jsonring" /></a>
<a href="https://github.com/1029734570"><img src="https://images.weserv.nl/?url=github.com/1029734570.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@1029734570" /></a>
<a href="https://github.com/86TheCactus"><img src="https://images.weserv.nl/?url=github.com/86TheCactus.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@86TheCactus" /></a>
<a href="https://github.com/AmiroKD"><img src="https://images.weserv.nl/?url=github.com/AmiroKD.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@AmiroKD" /></a>
<a href="https://github.com/ecryptomillionaire-dev"><img src="https://images.weserv.nl/?url=github.com/ecryptomillionaire-dev.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@ecryptomillionaire-dev" /></a>
<a href="https://github.com/4riful"><img src="https://images.weserv.nl/?url=github.com/4riful.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@4riful" /></a>
<a href="https://github.com/fix2015"><img src="https://images.weserv.nl/?url=github.com/fix2015.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@fix2015" /></a>
<a href="https://github.com/iisyw"><img src="https://images.weserv.nl/?url=github.com/iisyw.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@iisyw" /></a>
<a href="https://github.com/xsfhacg"><img src="https://images.weserv.nl/?url=github.com/xsfhacg.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@xsfhacg" /></a>
<a href="https://github.com/noobix"><img src="https://images.weserv.nl/?url=github.com/noobix.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@noobix" /></a>
<a href="https://github.com/nandukmelath"><img src="https://images.weserv.nl/?url=github.com/nandukmelath.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@nandukmelath" /></a>
<a href="https://github.com/NirvanaCh7"><img src="https://images.weserv.nl/?url=github.com/NirvanaCh7.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@NirvanaCh7" /></a>
<a href="https://github.com/Mohamed3nan"><img src="https://images.weserv.nl/?url=github.com/Mohamed3nan.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Mohamed3nan" /></a>
<a href="https://github.com/Arman-Espiar"><img src="https://images.weserv.nl/?url=github.com/Arman-Espiar.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Arman-Espiar" /></a>
<a href="https://github.com/MetaMysteries8"><img src="https://images.weserv.nl/?url=github.com/MetaMysteries8.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@MetaMysteries8" /></a>
<a href="https://github.com/lujun880726"><img src="https://images.weserv.nl/?url=github.com/lujun880726.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@lujun880726" /></a>
<a href="https://github.com/qq97693453"><img src="https://images.weserv.nl/?url=github.com/qq97693453.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@qq97693453" /></a>
<a href="https://github.com/emv33"><img src="https://images.weserv.nl/?url=github.com/emv33.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@emv33" /></a>
<a href="https://github.com/ousamabenyounes"><img src="https://images.weserv.nl/?url=github.com/ousamabenyounes.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@ousamabenyounes" /></a>
<a href="https://github.com/yfdyh000"><img src="https://images.weserv.nl/?url=github.com/yfdyh000.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@yfdyh000" /></a>
<a href="https://github.com/s-uryansh"><img src="https://images.weserv.nl/?url=github.com/s-uryansh.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@s-uryansh" /></a>
<a href="https://github.com/arsalanyavari"><img src="https://images.weserv.nl/?url=github.com/arsalanyavari.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@arsalanyavari" /></a>
<a href="https://github.com/RoboMWM"><img src="https://images.weserv.nl/?url=github.com/RoboMWM.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@RoboMWM" /></a>
<a href="https://github.com/gaurang-py"><img src="https://images.weserv.nl/?url=github.com/gaurang-py.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@gaurang-py" /></a>
<a href="https://github.com/ddy4633"><img src="https://images.weserv.nl/?url=github.com/ddy4633.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@ddy4633" /></a>
<a href="https://github.com/UrbsKali"><img src="https://images.weserv.nl/?url=github.com/UrbsKali.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@UrbsKali" /></a>
<a href="https://github.com/hb-0"><img src="https://images.weserv.nl/?url=github.com/hb-0.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@hb-0" /></a>
<a href="https://github.com/xyblue135"><img src="https://images.weserv.nl/?url=github.com/xyblue135.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@xyblue135" /></a>
<a href="https://github.com/Icesenator"><img src="https://images.weserv.nl/?url=github.com/Icesenator.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Icesenator" /></a>
<a href="https://github.com/ZER0-auto"><img src="https://images.weserv.nl/?url=github.com/ZER0-auto.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@ZER0-auto" /></a>
<a href="https://github.com/tashdroid"><img src="https://images.weserv.nl/?url=github.com/tashdroid.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@tashdroid" /></a>
<a href="https://github.com/Patrickleondev"><img src="https://images.weserv.nl/?url=github.com/Patrickleondev.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Patrickleondev" /></a>
<a href="https://github.com/hiiamwaffledev"><img src="https://images.weserv.nl/?url=github.com/hiiamwaffledev.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@hiiamwaffledev" /></a>
<a href="https://github.com/w0fv1"><img src="https://images.weserv.nl/?url=github.com/w0fv1.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@w0fv1" /></a>
<a href="https://github.com/oppih"><img src="https://images.weserv.nl/?url=github.com/oppih.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@oppih" /></a>
<a href="https://github.com/n3dhir"><img src="https://images.weserv.nl/?url=github.com/n3dhir.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@n3dhir" /></a>
<a href="https://github.com/ksp2000"><img src="https://images.weserv.nl/?url=github.com/ksp2000.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@ksp2000" /></a>
<a href="https://github.com/quabynahdavis"><img src="https://images.weserv.nl/?url=github.com/quabynahdavis.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@quabynahdavis" /></a>
<a href="https://github.com/qinghuanandejiangshi"><img src="https://images.weserv.nl/?url=github.com/qinghuanandejiangshi.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@qinghuanandejiangshi" /></a>
<a href="https://github.com/qatcod"><img src="https://images.weserv.nl/?url=github.com/qatcod.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@qatcod" /></a>
<a href="https://github.com/CooperSheroy"><img src="https://images.weserv.nl/?url=github.com/CooperSheroy.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@CooperSheroy" /></a>
<a href="https://github.com/shahidbeig-a11y"><img src="https://images.weserv.nl/?url=github.com/shahidbeig-a11y.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@shahidbeig-a11y" /></a>
<a href="https://github.com/Kaban15"><img src="https://images.weserv.nl/?url=github.com/Kaban15.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Kaban15" /></a>
<a href="https://github.com/efcunha"><img src="https://images.weserv.nl/?url=github.com/efcunha.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@efcunha" /></a>
<a href="https://github.com/sukaimi"><img src="https://images.weserv.nl/?url=github.com/sukaimi.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@sukaimi" /></a>
<a href="https://github.com/rome-xi"><img src="https://images.weserv.nl/?url=github.com/rome-xi.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@rome-xi" /></a>
<a href="https://github.com/bsi-bcp"><img src="https://images.weserv.nl/?url=github.com/bsi-bcp.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@bsi-bcp" /></a>
<a href="https://github.com/rodion-gudz"><img src="https://images.weserv.nl/?url=github.com/rodion-gudz.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@rodion-gudz" /></a>
<a href="https://github.com/bjornmage"><img src="https://images.weserv.nl/?url=github.com/bjornmage.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@bjornmage" /></a>
<a href="https://github.com/kenanlabs"><img src="https://images.weserv.nl/?url=github.com/kenanlabs.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@kenanlabs" /></a>
<a href="https://github.com/xzyj50609"><img src="https://images.weserv.nl/?url=github.com/xzyj50609.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@xzyj50609" /></a>
<a href="https://github.com/Ahmedtahoon2"><img src="https://images.weserv.nl/?url=github.com/Ahmedtahoon2.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Ahmedtahoon2" /></a>
<a href="https://github.com/Inference1"><img src="https://images.weserv.nl/?url=github.com/Inference1.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Inference1" /></a>
<a href="https://github.com/yzhkali"><img src="https://images.weserv.nl/?url=github.com/yzhkali.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@yzhkali" /></a>
<a href="https://github.com/levonk"><img src="https://images.weserv.nl/?url=github.com/levonk.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@levonk" /></a>
<a href="https://github.com/tripstar6000"><img src="https://images.weserv.nl/?url=github.com/tripstar6000.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@tripstar6000" /></a>
<a href="https://github.com/alkank"><img src="https://images.weserv.nl/?url=github.com/alkank.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@alkank" /></a>
<a href="https://github.com/Yi-111-a"><img src="https://images.weserv.nl/?url=github.com/Yi-111-a.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Yi-111-a" /></a>
<a href="https://github.com/The88788"><img src="https://images.weserv.nl/?url=github.com/The88788.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@The88788" /></a>
<a href="https://github.com/ac1982"><img src="https://images.weserv.nl/?url=github.com/ac1982.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@ac1982" /></a>
<a href="https://github.com/agammann"><img src="https://images.weserv.nl/?url=github.com/agammann.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@agammann" /></a>
<a href="https://github.com/Claven07"><img src="https://images.weserv.nl/?url=github.com/Claven07.png&w=40&h=40&fit=cover&mask=circle" width="40" alt="@Claven07" /></a>
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
