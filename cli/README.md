<div align="center">

# 🚀 SRouter

### The Ultimate Free AI Gateway & Smart LLM Router

**Never hit rate limits again. Save tokens with prompt compression + auto-fallback to ~60 free AI providers and ~1,200+ models.**

**Connect all AI coding tools (Claude Code, Cursor, Windsurf, Cline, Codex, Copilot, Aider, OpenCode...) behind a single unified OpenAI-compatible endpoint.**

[![npm version](https://img.shields.io/npm/v/@baiibayu/srouter.svg?color=blue&logo=npm)](https://www.npmjs.com/package/@baiibayu/srouter)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/baiibayu/srouter/blob/main/LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.18.0-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Docker Ready](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://github.com/baiibayu/srouter/blob/main/docs/en/install/01-install.md#docker-compose)
[![GHCR](https://img.shields.io/badge/ghcr.io-srouter-blue?logo=github&logoColor=white)](https://github.com/baiibayu/srouter/pkgs/container/srouter)
[![Desktop App](https://img.shields.io/badge/Desktop-Windows%20%7C%20macOS%20%7C%20Linux-blueviolet?logo=electron&logoColor=white)](https://github.com/baiibayu/srouter/releases/latest)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/baiibayu/srouter/blob/main/CONTRIBUTING.md)
[![Sponsor](https://img.shields.io/badge/Sponsor-baiibayu-ea4aaa?logo=github-sponsors&logoColor=white)](#-support-the-developer)

<p align="center">
  <a href="#-quick-start"><b>⚡ Quick Start</b></a> •
  <a href="#-compatible-coding-agents--clis"><b>🤖 Coding Agents</b></a> •
  <a href="#-provider-keys-management"><b>🔑 Keys CLI</b></a> •
  <a href="#-supported-providers"><b>🔌 Providers</b></a> •
  <a href="#-unified-api-endpoints"><b>🌐 API Endpoints</b></a> •
  <a href="#️-mcp-server-setup"><b>🛠️ MCP Setup</b></a> •
  <a href="#-why-srouter"><b>🤔 Why SRouter?</b></a> •
  <a href="#-how-it-works"><b>🔄 How It Works</b></a> •
  <a href="#-support-the-developer"><b>❤️ Support</b></a>
</p>

<p align="center">
  <a href="https://github.com/baiibayu/srouter/blob/main/docs/en/install/01-install.md#docker-compose"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/badges/docker.svg" height="42" alt="Self-host with Docker"></a>
  <a href="https://github.com/baiibayu/srouter/releases/latest/download/SRouter-Setup-win.exe"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/badges/windows.svg" height="42" alt="Download for Windows"></a>
  <a href="https://github.com/baiibayu/srouter/releases/latest/download/SRouter-mac-arm64.dmg"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/badges/macos-arm64.svg" height="42" alt="Download for macOS (Apple Silicon)"></a>
  <a href="https://github.com/baiibayu/srouter/releases/latest/download/SRouter-mac-x64.dmg"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/badges/macos-x64.svg" height="42" alt="Download for macOS (Intel)"></a>
  <a href="https://github.com/baiibayu/srouter/releases/latest/download/SRouter.AppImage"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/badges/linux.svg" height="42" alt="Download for Linux"></a>
</p>

![SRouter dashboard — live routing, monthly token budget, and usage stats](https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/github-hero.png)

*Your router auto-syncs its model catalog twice daily from a signed feed: new models, quota updates, and provider quirk fixes arrive automatically without needing a manual update.*

</div>

---

## 🤔 Why SRouter?

Coding with AI agents (Claude Code, Cursor, Windsurf, Cline) is transformative, but developers constantly run into walls:

| ❌ The Headaches | ✅ The SRouter Solution |
| :--- | :--- |
| **Quota Waste & Expirations:** Monthly paid API allowances sit unused or expire at month-end. | **Maximize Every Token:** Intelligently drains active quotas first, then rotates across other providers. |
| **Sudden Rate Limits (429):** One heavy prompt or repeated tool call halts your workflow mid-coding. | **Smart 3-Tier Auto-Fallback:** Instant, seamless failover (Subscription → Budget → 100% Free Keyless) with zero downtime. |
| **Token Burning on Tool Outputs:** Long `git diff`, `grep`, test logs, and JSON outputs consume massive context windows. | **Prompt Compression & Token Saver:** Built-in heuristics and structure-aware filters compress noisy tool results, **typically saving 20–40% tokens**. |
| **SDK & API Fragmentation:** Juggling 50+ incompatible SDKs, auth formats, and endpoint URLs. | **One Universal `/v1` Gateway:** A single OpenAI-compatible base URL (`http://localhost:20268/v1`) that also natively handles Anthropic Messages (`/v1/messages`), Codex (`/v1/responses`), Gemini (`/v1beta`), and Ollama emulation. |
| **Unpredictable Free Tiers:** Providers add, change, or deprecate free models every week. | **Self-Updating Catalog:** Pinned Ed25519 signed catalog auto-updates ~1,200+ models twice daily into your local SQLite DB. |
| **Privacy & Security Risks:** Sending API keys to cloud proxy providers exposes your credentials. | **100% Local & Encrypted:** Keys are stored locally using **AES-256-GCM** encryption; traffic proxies directly from your machine to upstream providers. |

![SRouter comparison vs OpenRouter, LiteLLM, and Portkey — one router, your keys, zero markup](https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/comparison.png)

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

When a request arrives, SRouter evaluates model health, current RPM/RPD limits, and prompt complexity. If an upstream provider returns `429 Too Many Requests` or `5xx Server Error`, the key enters a temporary cooldown, and SRouter **instantly retries the next best model in your fallback chain**.

![How SRouter routes one request through a live-scored fallback chain](https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/router-flow.png)

---

## ⚡ Quick Start

### 1. Run the Gateway via NPM / NPX

Run SRouter anywhere Node 20+ is installed without cloning the repository:

```bash
# Install globally
npm install -g @baiibayu/srouter

# Launch the gateway & open the Web Dashboard (default port 20268)
srouter

# Or run headless with custom port
srouter serve --port 3000 --no-browser

# Or run directly without installing using npx
npx @baiibayu/srouter
```

The Web Dashboard opens automatically at `http://localhost:20268`. Data is safely stored in `~/.srouter`.

### 2. Upgrading

Upgrades are seamless — your SQLite database and configuration survive updates:

```bash
# Check if a newer version exists
srouter update --check

# Upgrade to latest
srouter update
# or
npm install -g @baiibayu/srouter@latest
```

### 3. Docker & GHCR Alternative

```bash
# Run instantly from GitHub Container Registry
docker run -d --name srouter -p 20268:20268 -v srouter-data:/app/server/data ghcr.io/baiibayu/srouter:latest
```

---

## 🤖 Compatible Coding Agents & CLIs

SRouter includes automated configuration generators (`setup-*`) that inspect your live model catalog, take timestamped backups of existing settings, and write the exact configuration your tool expects:

<div align="center">

<table>
<tr>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/agents/claude-code.png" width="60" alt="Claude Code"><br/><b>Claude Code</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/agents/cursor.png" width="60" alt="Cursor"><br/><b>Cursor</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/agents/codex.png" width="60" alt="Codex CLI"><br/><b>Codex CLI</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/agents/cline.png" width="60" alt="Cline"><br/><b>Cline</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/agents/continue.png" width="60" alt="Continue"><br/><b>Continue</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/agents/aider.png" width="60" alt="Aider"><br/><b>Aider</b></td>
</tr>
<tr>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/agents/opencode.png" width="60" alt="OpenCode"><br/><b>OpenCode</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/agents/gemini-cli.png" width="60" alt="Gemini CLI"><br/><b>Gemini CLI</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/agents/roo-code.png" width="60" alt="Roo Code"><br/><b>Roo Code</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/agents/kilo-code.png" width="60" alt="Kilo Code"><br/><b>Kilo Code</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/agents/zed.png" width="60" alt="Zed"><br/><b>Zed</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/agents/jetbrains.png" width="60" alt="JetBrains"><br/><b>JetBrains</b></td>
</tr>
<tr>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/agents/goose.png" width="60" alt="Goose"><br/><b>Goose</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/agents/qwen-code.png" width="60" alt="Qwen Code"><br/><b>Qwen Code</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/agents/crush.png" width="60" alt="Crush"><br/><b>Crush</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/agents/factory-droid.png" width="60" alt="Factory Droid"><br/><b>Factory Droid</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/agents/openclaw.png" width="60" alt="OpenClaw"><br/><b>OpenClaw</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/agents/deepseek-harness.png" width="60" alt="DeepSeek Harness"><br/><b>DeepSeek Harness</b></td>
</tr>
<tr>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/agents/oh-my-pi.png" width="60" alt="Oh My Pi"><br/><b>Oh My Pi</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/agents/hermes-agent.png" width="60" alt="Hermes"><br/><b>Hermes</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/agents/pi.png" width="60" alt="Pi"><br/><b>Pi</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/agents/atomcode.png" width="60" alt="AtomCode"><br/><b>AtomCode</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/agents/reasonix.png" width="60" alt="Reasonix"><br/><b>Reasonix</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/badges/windows.svg" width="60" alt="OpenClaude"><br/><b>OpenClaude</b></td>
</tr>
</table>

</div>

### Setup Commands Reference

Configure any agent with one command:

```bash
# Point Claude Code to SRouter
srouter setup-claude --url http://localhost:20268 --api-key <your-unified-key>

# Or run via npx without global install
npx @baiibayu/srouter setup-cursor --url http://localhost:20268 --api-key <your-unified-key>
```

| Tool | Setup Command | Target Base URL | Protocol |
| :--- | :--- | :--- | :--- |
| **Claude Code** | `srouter setup-claude` | `http://localhost:20268` | Native Anthropic `/v1/messages` |
| **Cursor** | `srouter setup-cursor` | `http://localhost:20268/v1` | OpenAI Chat Completions |
| **Codex CLI** | `srouter setup-codex` | `http://localhost:20268/v1` | Native `/v1/responses` |
| **Cline** | `srouter setup-cline` | `http://localhost:20268/v1` | OpenAI / Anthropic format |
| **Continue** | `srouter setup-continue` | `http://localhost:20268/v1` | Chat + Ghost-text completions |
| **Aider** | `srouter setup-aider` | `http://localhost:20268/v1` | OpenAI Chat Completions |
| **OpenCode** | `srouter setup-opencode` | `http://localhost:20268/v1` | OpenAI Chat Completions |
| **Goose** | `srouter setup-goose` | `http://localhost:20268/v1` | OpenAI Chat Completions |
| **Qwen Code** | `srouter setup-qwen` | `http://localhost:20268/v1` | OpenAI or Gemini format |
| **Roo Code** | `srouter setup-roo` | `http://localhost:20268/v1` | OpenAI Chat Completions |
| **Kilo Code** | `srouter setup-kilo` | `http://localhost:20268/v1` | OpenAI Chat Completions |
| **Crush** | `srouter setup-crush` | `http://localhost:20268/v1` | OpenAI Chat Completions |
| **DeepSeek Harness** | `srouter setup-dsh` | `http://localhost:20268/v1` | OpenAI Chat Completions |
| **MiMo Code** | `srouter setup-mimo` | `http://localhost:20268/v1` | OpenAI Chat Completions |
| **Oh My Pi** | `srouter setup-omp` | `http://localhost:20268/v1` | OpenAI Chat Completions |
| **OpenClaw** | `srouter setup-openclaw` | `http://localhost:20268/v1` | OpenAI Chat Completions |
| **Hermes Agent** | `srouter setup-hermes` | `http://localhost:20268/v1` | OpenAI Chat Completions |
| **Pi** | `srouter setup-pi` | `http://localhost:20268/v1` | OpenAI Chat Completions |
| **Reasonix** | `srouter setup-reasonix` | `http://localhost:20268/v1` | OpenAI Chat Completions |
| **Factory Droid** | `srouter setup-droid` | `http://localhost:20268/v1` | OpenAI Chat Completions |
| **OpenClaude** | `srouter setup-openclaude` | `http://localhost:20268/v1` | OpenAI Chat Completions |
| **AtomCode** | `srouter setup-atomcode` | `http://localhost:20268/v1` | OpenAI Chat Completions |
| **Zed / JetBrains** | `srouter setup-zed` / `setup-jetbrains` | `http://localhost:20268` | Ollama Emulation (`/api/*`) |
| **Generic OpenAI** | `srouter setup-generic` | `http://localhost:20268/v1` | Standard OpenAI API |

### Zero-Persistence Launchers

Launch agents without writing sensitive keys to your disk:

```bash
# Injects credentials directly into Claude Code's child process environment
srouter launch

# Injects credentials directly into Codex CLI
srouter launch-codex
```

### Diagnostics & Health Check (`srouter doctor`)

Diagnose whether your coding tools are actually reaching the gateway (resolving environment variables, configuration precedence, and reachability):

```bash
srouter doctor
# or check a specific tool:
srouter doctor claude
srouter doctor codex
```

### CLI Generator Flags

| Flag | Description |
| :--- | :--- |
| `--url URL` | Gateway base URL (default: `http://localhost:20268` or `SROUTER_URL`) |
| `--api-key KEY` | Unified API key (or `SROUTER_API_KEY`) |
| `--profile NAME` | Name the generated profile/provider entry (default: `default`) |
| `--model ID` | Pin a specific model instead of the catalog default |
| `--dry-run` | Print the exact configuration diff to stdout and write nothing |

---

## 🔑 Provider Keys Management

Manage upstream provider keys right from your terminal without opening a browser. These commands authenticate using your dashboard session token (`SROUTER_DASHBOARD_TOKEN` or `--token`):

```bash
export SROUTER_URL=http://localhost:20268
export SROUTER_DASHBOARD_TOKEN='<dashboard-session-token>'

# Interactive prompt (hidden input)
srouter keys add groq

# Non-interactive addition
srouter keys add groq --key 'gsk_...'

# List all stored keys (shows ID, platform, active models, health status)
srouter keys list

# Test provider key health through the gateway
srouter keys test groq
srouter keys test groq --id 3

# Remove a provider key safely
srouter keys remove groq --id 3
```

---

## 🔌 Supported Providers

SRouter aggregates **~60 providers** and **~1,200+ endpoints** behind one unified `/v1` endpoint.

<div align="center">

<table>
<tr>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/providers/google.png" width="60" alt="Google Gemini"><br/><b>Google Gemini</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/providers/groq.png" width="60" alt="Groq"><br/><b>Groq</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/providers/mistral.png" width="60" alt="Mistral"><br/><b>Mistral</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/providers/openrouter.png" width="60" alt="OpenRouter"><br/><b>OpenRouter</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/providers/alibaba.png" width="60" alt="Alibaba Qwen"><br/><b>Alibaba Qwen</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/providers/nous.png" width="60" alt="Nous Research"><br/><b>Nous Research</b></td>
</tr>
<tr>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/providers/siliconflow.png" width="60" alt="SiliconFlow"><br/><b>SiliconFlow</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/providers/modelscope.png" width="60" alt="ModelScope"><br/><b>ModelScope</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/providers/cloudflare.png" width="60" alt="Cloudflare"><br/><b>Cloudflare</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/providers/cohere.png" width="60" alt="Cohere"><br/><b>Cohere</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/providers/zhipu.png" width="60" alt="Zhipu GLM"><br/><b>Zhipu GLM</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/providers/nvidia.png" width="60" alt="NVIDIA NIM"><br/><b>NVIDIA NIM</b></td>
</tr>
<tr>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/providers/baidu.png" width="60" alt="Baidu Qianfan"><br/><b>Baidu Qianfan</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/providers/bytedance.png" width="60" alt="ByteDance Ark"><br/><b>ByteDance Ark</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/providers/iflytek.png" width="60" alt="iFlytek Spark"><br/><b>iFlytek Spark</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/providers/amd.png" width="60" alt="AMD Radeon"><br/><b>AMD Radeon</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/providers/huggingface.png" width="60" alt="HuggingFace"><br/><b>HuggingFace</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/providers/kilo.png" width="60" alt="Kilo"><br/><b>Kilo</b></td>
</tr>
<tr>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/providers/llm7.png" width="60" alt="LLM7"><br/><b>LLM7</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/providers/ollama.png" width="60" alt="Ollama"><br/><b>Ollama</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/providers/ovh.png" width="60" alt="OVH"><br/><b>OVH</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/providers/pollinations.png" width="60" alt="Pollinations"><br/><b>Pollinations</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/providers/opencode.png" width="60" alt="OpenCode"><br/><b>OpenCode</b></td>
<td align="center"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/providers/aihorde.png" width="60" alt="AI Horde"><br/><b>AI Horde</b></td>
</tr>
</table>

</div>

### Provider Tiers

1. **⚡ 100% Free / Keyless:** Kilo Gateway (No Key), OpenCode Free (No Key), OVH AI Endpoints, LLM7, AI Horde.
2. **🌐 Generous Free Tier with Key:** Google AI Studio (Gemini 2.5 Flash / Pro), Groq (Llama 3.3 70B @ 30 RPM), Mistral AI (Codestral), Cloudflare Workers AI (10k neurons/day), Cohere, Zhipu GLM-4, NVIDIA NIM.
3. **🌏 Regional & High Quota:** ModelScope (Aliyun, 2,000 req/day), Baidu Qianfan, Volcengine Ark, NaraRouter, Sea-Lion.
4. **🔌 Custom Local / Self-Hosted:** Connect Ollama, LM Studio, vLLM, or llama.cpp directly via the Keys page.

---

## 🌐 Unified API Endpoints

SRouter translates diverse API wire protocols into standard surfaces:

| Endpoint | Method | Protocol / Target | Description |
| :--- | :--- | :--- | :--- |
| `/v1/chat/completions` | `POST` | OpenAI Chat | Universal LLM chat completions with multi-tier auto-fallback |
| `/v1/responses` | `POST` | OpenAI Responses | Native Codex CLI response endpoint |
| `/v1/messages` | `POST` | Anthropic Messages | Native wire format for Claude Code and Anthropic SDKs |
| `/v1beta/models/*:generateContent` | `POST` | Google Gemini | Native Gemini wire API for Gemini CLI and SDKs |
| `/v1/search` | `POST` | Unified Search | Aggregated web search across DuckDuckGo, SearXNG, Brave, etc. |
| `/v1/fetch` | `POST` | Web Fetch Relay | Clean reader-mode HTML/Markdown extraction for URLs |
| `/v1/decision` | `POST` | Decision System One | Fast heuristic prompt complexity & model selector |
| `/mcp` | `GET` / `POST` | Model Context Protocol | Streamable HTTP transport for Claude Desktop, Cursor, and agents |
| `/v1/models` | `GET` | OpenAI Models | Model catalog with live `execution_status` & available filters |
| `/v1/embeddings` | `POST` | OpenAI Embeddings | Vector embeddings generation |
| `/v1/images/generations` | `POST` | OpenAI Images | Multi-provider image generation (Pollinations, Flux, SD) |
| `/v1/audio/speech` | `POST` | OpenAI Audio TTS | Text-to-speech audio synthesis |
| `/v1/audio/transcriptions` | `POST` | OpenAI Audio STT | Speech-to-text audio transcription |
| `/api/tags` | `GET` | Ollama Emulation | Returns local & active model catalog for Zed / JetBrains |
| `/api/chat` | `POST` | Ollama Emulation | NDJSON streaming chat completions for Ollama clients |
| `/v1/docs` | `GET` | OpenAPI Documentation | Interactive Swagger/Redoc API documentation viewer |

> [!TIP]
> **Decision System One (`/v1/decision`):** Use this endpoint before sending expensive queries to determine whether a prompt requires a lightweight fast model or a heavy reasoning model.
>
> **Web Tools (`/v1/search` & `/v1/fetch`):** Built-in web scraping and search tools allow your coding agents to research latest docs, packages, and troubleshooting guides directly through the gateway.

---

## 🛠️ MCP Server Setup

SRouter includes a native **Model Context Protocol (MCP)** server over **Streamable HTTP** at `http://localhost:20268/mcp`.

### Claude Desktop Configuration

Add SRouter to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "srouter": {
      "url": "http://localhost:20268/mcp",
      "headers": {
        "Authorization": "Bearer srouter-your-unified-key"
      }
    }
  }
}
```

### Cursor / Cline Configuration

In your editor's MCP settings, add a new server:
- **Name:** `srouter`
- **Type:** `sse` or `streamable-http`
- **URL:** `http://localhost:20268/mcp`
- **Headers:** `{"Authorization": "Bearer srouter-your-unified-key"}`

Available MCP tools include `list_models`, `get_model_status`, `check_provider_health`, and `web_search`.

---

## 🔒 Safety, Security & Local Privacy

- **Non-Destructive Generators:** Generator commands merge into existing configuration files rather than overwriting them, taking a timestamped `.bak` backup first. `--dry-run` shows the exact diff beforehand.
- **Zero-Exposure Launchers:** `srouter launch` and `srouter launch-codex` inject credentials only into child process memory — no keys are ever written to disk.
- **Local AES-256-GCM Vault:** Upstream API keys are encrypted locally using AES-256-GCM in SQLite (`~/.srouter/srouter.db`). No telemetry, no cloud relays, no credential leakage.
- **Fail-Open Compression:** Token saver and regex compression filters will fail-open safely: if a filter cannot parse an input, the raw prompt is forwarded intact.

---

## ⚠️ Troubleshooting & FAQ

### Port 20268 is already in use
Specify an alternate port with `--port`:
```bash
srouter serve --port 3000
```

### Rate limit hit (429 Too Many Requests)
SRouter automatically cools down the exhausted key and seamlessly retries the next provider in your fallback chain. If all keys for that model tier are exhausted, enable 100% keyless providers (such as Kilo Gateway or OpenCode Free) via the Web Dashboard.

### Where is my data stored?
- Global CLI: `~/.srouter/srouter.db`
- Docker: Named volume `srouter-data` (`/app/server/data`)
- Windows Desktop: `%APPDATA%\SRouter\srouter.db`
- macOS Desktop: `~/Library/Application Support/SRouter/srouter.db`

---

## ❤️ Support the Developer

If SRouter saves you tokens, boosts your coding workflow, or saves you money, consider supporting development. Every coffee keeps this project independent and actively maintained!

[![Trakteer](https://img.shields.io/badge/Trakteer-e11d48?style=for-the-badge&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI%2BPHBhdGggZmlsbD0id2hpdGUiIGQ9Ik00IDRoMTZ2M2gtNi41djExaC0zVjdINFY0eiIvPjwvc3ZnPg%3D%3D&logoColor=white)](https://trakteer.id/baiibayu/tip)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/baiibayu)
[![PayPal](https://img.shields.io/badge/PayPal-0070BA?style=for-the-badge&logo=paypal&logoColor=white)](https://www.paypal.me/baiibayu)

---

## 📄 License & Disclaimer

- **License:** Open-source under the [MIT License](https://github.com/baiibayu/srouter/blob/main/LICENSE).
- **Disclaimer:** SRouter is designed for personal development, experimentation, and coding agent enhancement. Free tiers are governed by the terms of service of each respective upstream provider.
- **Repository:** [https://github.com/baiibayu/srouter](https://github.com/baiibayu/srouter)
- **Author:** [baiibayu](https://github.com/baiibayu)

<div align="center">
<sub>Crafted with passion by <b><a href="https://github.com/baiibayu">@baiibayu</a></b> & community contributors.</sub>
</div>
