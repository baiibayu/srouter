<div align="center">

# 🚀 SRouter

### 智能本地优先 AI 网关与免费大模型路由器

**告别速率限制（429）。通过提示词压缩与自动故障转移，聚合约 60 家免费 AI 提供方与 1,200+ 免费模型端点。**

**让所有 AI 编程工具（Claude Code、Cursor、Windsurf、Cline、Codex、Copilot、Aider、OpenCode 等）无缝连接到单个统一的 OpenAI 兼容端点。**

[![npm version](https://img.shields.io/npm/v/@baiibayu/srouter.svg?color=blue&logo=npm)](https://www.npmjs.com/package/@baiibayu/srouter)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.18.0-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Docker Ready](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](docs/zh-cn/install/01-install.md#docker-compose)
[![Desktop App](https://img.shields.io/badge/Desktop-Windows%20%7C%20macOS%20%7C%20Linux-blueviolet?logo=electron&logoColor=white)](desktop/)
[![i18n Locales](https://img.shields.io/badge/i18n-60%20Languages-orange)](client/src/i18n/locale-config.ts)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)
[![Sponsor](https://img.shields.io/badge/Sponsor-baiibayu-ea4aaa?logo=github-sponsors&logoColor=white)](#-支持与赞助)

<p align="center">
  <a href="#-快速开始"><b>⚡ 快速开始</b></a> •
  <a href="#-为什么选择-srouter"><b>🤔 为什么选择 SRouter?</b></a> •
  <a href="#-工作原理与架构"><b>🔄 工作原理</b></a> •
  <a href="#-核心特性"><b>✨ 核心特性</b></a> •
  <a href="#-编程智能体接入"><b>🤖 智能体接入</b></a> •
  <a href="#-支持的提供方"><b>🔌 提供方</b></a> •
  <a href="#-项目结构"><b>🏗️ 项目结构</b></a> •
  <a href="docs/zh-cn/README.md"><b>📚 文档中心</b></a>
</p>

<p align="center">
  <b>语言 / Language:</b>
  <a href="README.md"><b>🇺🇸 English</b></a> •
  <a href="README.id.md"><b>🇮🇩 Bahasa Indonesia</b></a> •
  <a href="README.zh-cn.md"><b>🇨🇳 简体中文</b></a> •
  <a href="README.ja.md"><b>🇯🇵 日本語</b></a>
</p>

<p align="center">
  <a href="docs/zh-cn/install/01-install.md#docker-compose"><img src="repo-assets/badges/docker.svg" height="42" alt="Docker 自建"></a>
  <a href="desktop/"><img src="repo-assets/badges/windows.svg" height="42" alt="Windows 桌面客户端"></a>
  <a href="desktop/"><img src="repo-assets/badges/macos.svg" height="42" alt="macOS 桌面客户端"></a>
</p>

![SRouter 仪表盘 —— 实时路由、每月词元额度与用量统计](repo-assets/github-hero.png)

*您的路由器会从经过 Ed25519 签名的源每天自动同步两次模型目录：无需 `git pull`，新的免费模型、配额变更与兼容性修复即可自动入库生效。*

</div>

---

## 🤔 为什么选择 SRouter?

使用 AI 编程助手（Claude Code、Cursor、Windsurf、Cline）已经成为现代开发者的日常，但普遍存在以下痛点：

| ❌ 实际开发中的痛点 | ✅ SRouter 智能解决方案 |
| :--- | :--- |
| **付费额度闲置与过期：** 每月付费订阅的 Token 额度用不完或月末直接清零。 | **最大化利用每一枚 Token：** 优先智能消耗即将过期的配额，并在多提供方间自动轮询。 |
| **突发限流中断开发（429）：** 一次复杂的提示词或连续工具调用瞬间打断编码思路。 | **智能三级自动降级（Auto-Fallback）：** 毫秒级无感故障转移（订阅模型 $\to$ 廉价模型 $\to$ 100% 免费免密模型），保证零停机。 |
| **工具输出疯狂燃烧 Token：** 冗长的 `git diff`、终端日志、测试输出与 JSON 快速撑爆上下文窗口。 | **提示词压缩与 Token 节省器：** 内置启发式 AST 规则，自动裁剪嘈杂的工具输出，**立省 20–40% Token**。 |
| **SDK 与接口协议极其碎片化：** 对接数十家供应商需要维护多套 SDK、不同的 Auth 格式与 URL。 | **单个通用 `/v1` 网关：** 一个 OpenAI 兼容地址（`http://localhost:20268/v1`），同时原生支持 Anthropic Messages（`/v1/messages`）、Gemini（`/v1beta`）及 Ollama 仿真。 |
| **免费额度变化频繁且无通知：** 厂商每周都会上线、下线模型或悄悄修改限制规则。 | **模型目录自动签名同步：** 每天两次从受信签名源同步约 1,200+ 模型至本地 SQLite，持久保鲜。 |
| **隐私泄露风险：** 将真实 API 密钥发送给未知的第三方云端代理容易造成凭据泄露。 | **100% 本地 AES-256-GCM 加密存储：** 密钥完全保存在本地；AI 请求直接从本机发送至官方上游，无第三方中转嗅探。 |

---

## 🔄 工作原理与架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       您的编程工具与 IDE 智能体                             │
│       (Claude Code, Cursor, Windsurf, Cline, Roo Code, Codex, Aider)        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ http://localhost:20268/v1
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SRouter 智能 AI 网关                              │
│  • 复杂度闸门（System One：简单提示快速路由，复杂编程深层推理）            │
│  • 提示词压缩器与 Token 节省器（过滤冗长终端与工具输出）                    │
│  • 协议自动转换（OpenAI ↔ Anthropic Messages ↔ Gemini ↔ Ollama）            │
│  • 细粒度配额跟踪（按 RPM / RPD / TPM 跟踪并在 UTC 窗口自动重置）           │
│  • 本地 AES-256-GCM 加密保险箱与 SQLite 持久化                              │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
 ┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
 │     第一级: 高速/订阅    │   │     第二级: 大额度/高质  │   │   第三级: 100% 免费免密  │
 │  • Google Gemini 2.5     │   │  • Mistral / Codestral   │   │  • Kilo Gateway (免密)   │
 │  • Groq (Llama 3.3 70B)  │──►│  • 智谱 GLM-4 / 视觉模型 │──►│  • OpenCode Free (免密)  │
 │  • Pollinations (免费)   │   │  • Cloudflare Workers AI │   │  • OVH Endpoints (免密)  │
 │  • OpenRouter / DeepSeek │   │  • Cohere / NVIDIA NIM   │   │  • LLM7 / AI Horde       │
 └──────────────────────────┘   └──────────────────────────┘   └──────────────────────────┘
```

当请求到达时，SRouter 评估模型可用状态、速率限制与任务复杂度。一旦上游返回 `429 Too Many Requests` 或 `5xx` 错误，该密钥将自动进入冷却保护，SRouter **瞬间自动重试降级链中的下一个最优模型**，编程过程完全不被打断。

---

## ⚡ 快速开始

选择最适合您当前环境的运行方式：

### 方式 1：全局 CLI / NPX（最便捷）

无需克隆仓库，只要安装了 Node.js 20+ 即可随时启动：

```bash
# 使用 npx 直接运行
npx @baiibayu/srouter

# 或全局安装为系统命令
npm install -g @baiibayu/srouter
srouter
```

浏览器将自动打开管理面板：`http://localhost:20268`。

---

### 方式 2：Docker Compose（推荐用于服务器与私有云）

```bash
# 1. 克隆代码库
git clone https://github.com/baiibayu/srouter.git
cd srouter

# 2. 复制环境配置并启动容器
cp .env.example .env
docker compose up -d
```

- **仪表盘面板：** `http://localhost:20268`
- **OpenAI 兼容端点：** `http://localhost:20268/v1`

---

### 方式 3：桌面应用（Windows 与 macOS）

偏好拥有系统托盘常驻图标与原生弹窗体验：

1. 前往 **[Releases 发行页](https://github.com/baiibayu/srouter/releases/latest)**。
2. 下载对应安装包：
   - **Windows:** `SRouter-Setup-x.x.x.exe`
   - **macOS:** `SRouter-x.x.x-arm64.dmg`（Apple Silicon）或 `x64.dmg`（Intel）。
3. 运行应用。SRouter 会常驻在托盘区，点击即可查看实时请求状态与统一 API 密钥。

---

### 方式 4：从源码运行（本地 Monorepo 开发）

```bash
# 1. 克隆并安装依赖
git clone https://github.com/baiibayu/srouter.git
cd srouter
npm install

# 2. 执行数据库迁移
npm run db:migration:up

# 3. 启动开发模式（服务端 :20268 与前端 :5173 均支持热重载）
npm run dev
```

---

## 🤖 编程智能体接入

SRouter 提供了自动化配置生成器（`setup-*`），能够自动读取您当前运行的服务状态并生成对应工具的配置文件：

<div align="center">

<table>
<tr>
<td align="center"><img src="repo-assets/agents/claude-code.png" width="40" alt="Claude Code"><br/><b>Claude Code</b></td>
<td align="center"><img src="repo-assets/agents/cursor.png" width="40" alt="Cursor"><br/><b>Cursor</b></td>
<td align="center"><img src="repo-assets/agents/codex.png" width="40" alt="Codex CLI"><br/><b>Codex CLI</b></td>
<td align="center"><img src="repo-assets/agents/cline.png" width="40" alt="Cline"><br/><b>Cline</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/agents/continue.png" width="40" alt="Continue"><br/><b>Continue</b></td>
<td align="center"><img src="repo-assets/agents/aider.png" width="40" alt="Aider"><br/><b>Aider</b></td>
<td align="center"><img src="repo-assets/agents/opencode.png" width="40" alt="OpenCode"><br/><b>OpenCode</b></td>
<td align="center"><img src="repo-assets/agents/gemini-cli.png" width="40" alt="Gemini CLI"><br/><b>Gemini CLI</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/agents/roo-code.png" width="40" alt="Roo Code"><br/><b>Roo Code</b></td>
<td align="center"><img src="repo-assets/agents/kilo-code.png" width="40" alt="Kilo Code"><br/><b>Kilo Code</b></td>
<td align="center"><img src="repo-assets/agents/zed.png" width="40" alt="Zed"><br/><b>Zed</b></td>
<td align="center"><img src="repo-assets/agents/jetbrains.png" width="40" alt="JetBrains"><br/><b>JetBrains</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/agents/goose.png" width="40" alt="Goose"><br/><b>Goose</b></td>
<td align="center"><img src="repo-assets/agents/qwen-code.png" width="40" alt="Qwen Code"><br/><b>Qwen Code</b></td>
<td align="center"><img src="repo-assets/agents/crush.png" width="40" alt="Crush"><br/><b>Crush</b></td>
<td align="center"><img src="repo-assets/agents/factory-droid.png" width="40" alt="Factory Droid"><br/><b>Factory Droid</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/agents/openclaw.png" width="40" alt="OpenClaw"><br/><b>OpenClaw</b></td>
<td align="center"><img src="repo-assets/agents/deepseek-harness.png" width="40" alt="DeepSeek Harness"><br/><b>DeepSeek Harness</b></td>
<td align="center"><img src="repo-assets/agents/oh-my-pi.png" width="40" alt="Oh My Pi"><br/><b>Oh My Pi</b></td>
<td align="center"><img src="repo-assets/agents/hermes-agent.png" width="40" alt="Hermes"><br/><b>Hermes</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/agents/pi.png" width="40" alt="Pi"><br/><b>Pi</b></td>
<td align="center"><img src="repo-assets/agents/atomcode.png" width="40" alt="AtomCode"><br/><b>AtomCode</b></td>
</tr>
</table>

</div>

```bash
# 为 Claude Code 自动配置
npx srouter setup-claude --url http://localhost:20268 --api-key <您的统一密钥>
```

| 编程工具 | 自动配置命令 | 目标 Base URL | 协议适配说明 |
| :--- | :--- | :--- | :--- |
| **Claude Code** | `npx srouter setup-claude` 或 `srouter launch` | `http://localhost:20268` | 原生 Anthropic `/v1/messages` 格式 |
| **Cursor / Windsurf** | `npx srouter setup-cursor`（或手动设置） | `http://localhost:20268/v1` | OpenAI Chat Completions 协议 |
| **Cline** | `npx srouter setup-cline` | `http://localhost:20268/v1` | OpenAI / Anthropic 双格式 |
| **Roo Code / Kilo** | `npx srouter setup-roo` / `setup-kilo` | `http://localhost:20268/v1` | OpenAI Chat Completions 协议 |
| **Codex CLI** | `npx srouter setup-codex` 或 `srouter launch-codex` | `http://localhost:20268/v1` | 原生 `/v1/responses` 格式 |
| **Aider** | `npx srouter setup-aider` | `http://localhost:20268/v1` | OpenAI Chat Completions 协议 |
| **Continue.dev** | `npx srouter setup-continue` | `http://localhost:20268/v1` | 对话与代码补全双支持 |
| **OpenCode** | `npx srouter setup-opencode` | `http://localhost:20268/v1` | OpenAI Chat Completions 协议 |
| **Gemini CLI** | 原生 `/v1beta` | `http://localhost:20268` | 原生 `generateContent` 格式 |
| **Zed / JetBrains AI** | Ollama 仿真 | `http://localhost:20268` | 原生 NDJSON Ollama 协议 |

<details>
<summary><b>展开查看配置示例（点击展开）</b></summary>

### Claude Code 无凭据持久化启动
```bash
# 直接注入临时凭据到子进程，绝不向磁盘写入明文 Key
npx srouter launch
```

### Cursor / Windsurf 偏好设置
```json
{
  "openai.baseUrl": "http://localhost:20268/v1",
  "openai.apiKey": "srouter-您的统一密钥",
  "openai.model": "auto"
}
```

### Python SDK 调用示例
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:20268/v1",
    api_key="srouter-您的统一密钥",
)

response = client.chat.completions.create(
    model="auto:smart",  # 或 "auto:fast", "auto", 或指定模型名
    messages=[{"role": "user", "content": "请用一句话解释量子纠缠。"}],
)

print(response.choices[0].message.content)
print("实际服务提供方:", response.headers.get("x-routed-via"))
```

</details>

---

## 🔌 支持的提供方

SRouter 在单个 `/v1` 接口之后聚合了 **约 60 家提供方** 与 **1,200+ 免费模型端点**。

<div align="center">

<table>
<tr>
<td align="center"><img src="repo-assets/providers/google.png" width="40" alt="Google Gemini"><br/><b>Google Gemini</b></td>
<td align="center"><img src="repo-assets/providers/groq.png" width="40" alt="Groq"><br/><b>Groq</b></td>
<td align="center"><img src="repo-assets/providers/mistral.png" width="40" alt="Mistral"><br/><b>Mistral</b></td>
<td align="center"><img src="repo-assets/providers/openrouter.png" width="40" alt="OpenRouter"><br/><b>OpenRouter</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/providers/alibaba.png" width="40" alt="Alibaba Qwen"><br/><b>Alibaba Qwen</b></td>
<td align="center"><img src="repo-assets/providers/nous.png" width="40" alt="Nous Research"><br/><b>Nous Research</b></td>
<td align="center"><img src="repo-assets/providers/siliconflow.png" width="40" alt="SiliconFlow"><br/><b>SiliconFlow</b></td>
<td align="center"><img src="repo-assets/providers/modelscope.png" width="40" alt="ModelScope"><br/><b>ModelScope</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/providers/cloudflare.png" width="40" alt="Cloudflare"><br/><b>Cloudflare</b></td>
<td align="center"><img src="repo-assets/providers/cohere.png" width="40" alt="Cohere"><br/><b>Cohere</b></td>
<td align="center"><img src="repo-assets/providers/zhipu.png" width="40" alt="智谱清言 GLM"><br/><b>智谱清言 GLM</b></td>
<td align="center"><img src="repo-assets/providers/nvidia.png" width="40" alt="NVIDIA NIM"><br/><b>NVIDIA NIM</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/providers/baidu.png" width="40" alt="Baidu Qianfan"><br/><b>Baidu Qianfan</b></td>
<td align="center"><img src="repo-assets/providers/bytedance.png" width="40" alt="ByteDance Ark"><br/><b>ByteDance Ark</b></td>
<td align="center"><img src="repo-assets/providers/iflytek.png" width="40" alt="iFlytek Spark"><br/><b>iFlytek Spark</b></td>
<td align="center"><img src="repo-assets/providers/amd.png" width="40" alt="AMD Radeon"><br/><b>AMD Radeon</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/providers/huggingface.png" width="40" alt="HuggingFace"><br/><b>HuggingFace</b></td>
<td align="center"><img src="repo-assets/providers/kilo.png" width="40" alt="Kilo"><br/><b>Kilo</b></td>
<td align="center"><img src="repo-assets/providers/llm7.png" width="40" alt="LLM7"><br/><b>LLM7</b></td>
<td align="center"><img src="repo-assets/providers/ollama.png" width="40" alt="Ollama"><br/><b>Ollama</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/providers/ovh.png" width="40" alt="OVH"><br/><b>OVH</b></td>
<td align="center"><img src="repo-assets/providers/pollinations.png" width="40" alt="Pollinations"><br/><b>Pollinations</b></td>
<td align="center"><img src="repo-assets/providers/opencode.png" width="40" alt="OpenCode"><br/><b>OpenCode</b></td>
<td align="center"><img src="repo-assets/providers/aihorde.png" width="40" alt="AI Horde 社区池"><br/><b>AI Horde 社区池</b></td>
</tr>
</table>

</div>

### 1. ⚡ 100% 免密钥 / 真正免费（无需注册，无需绑定银行卡）
| 提供方 | 免费模型 | 说明 |
| :--- | :--- | :--- |
| **Kilo Gateway** | Kilo Auto Free, Nemotron-3 Ultra Free | 匿名免登录，直接可用 |
| **OpenCode Free** | OpenCode 系列模型 | 内置免费开源推理池 |
| **OVH AI Endpoints** | Qwen3Guard, Stable Diffusion, Whisper TTS | 2 RPM 匿名免密端点 |
| **LLM7** | Codestral, Mistral-Nemo, Gemma 4, GPT-OSS | 每日大额免费配额 |
| **AI Horde** | 社区 LLaMA, Qwen, Gemma, Mistral | 社区分布式算力池 |

### 2. 🌐 具备大额免费配额的海外与主流提供方
- **Google AI Studio:** Gemini 2.5 Flash / Pro（极具性价比的每日免费调用限额）
- **Groq:** Llama 3.3 70B & Mixtral（极速推理，30 RPM 免费档）
- **Pollinations:** 免费文本+图像 (无需密钥)
- **Mistral AI:** Codestral（专业代码模型）、Mistral Small
- **Cloudflare Workers AI:** 每日 10,000 neurons 免费额度
- **Cohere:** Command R / Command R+ 测试点数
- **NVIDIA NIM:** 1,000 点开源前沿模型免费 API 试用

### 3. 🌏 国内大模型与高配额网关
- **ModelScope 魔搭社区（阿里云）：** Qwen3.8、DeepSeek V4 Pro、GLM-5.2（每日 2,000 次免费调用）
- **百度千帆与火山引擎 Ark：** 深度求索 DeepSeek 与豆包系列免费模型
- **智谱 AI（Z.ai）：** GLM-4 编程与多模态模型
- **NaraRouter & Sea-Lion：** 针对东南亚与跨语言低延迟优化的特色模型

### 4. 🔌 本地与自定义服务
支持通过仪表盘中的密钥页面直接添加由 **Ollama**、**LM Studio**、**vLLM** 或 **llama.cpp** 本地托管的模型。

---

## 🏗️ 项目结构

SRouter 采用现代化且结构清晰的 Monorepo 架构组织：

```
srouter/
├── cli/                 ← CLI 命令行工具与智能体自动配置生成器 (`srouter setup-*`)
├── client/              ← Web 仪表盘 (React + Vite + Tailwind + Lucide，支持 60 种语言)
├── desktop/             ← Electron 桌面常驻托盘客户端 (macOS 与 Windows)
├── docker/              ← Dockerfile 与容器编排配置文件
├── docs/                ← 完整多语言技术文档与 API 参考
│   ├── en/              ← 英文文档中心
│   ├── id/              ← 印尼语官方文档
│   ├── zh-cn/           ← 简体中文技术文档
│   └── README.md        ← 文档导航入口
├── repo-assets/         ← 项目品牌图标、架构流程图与界面截图
├── scripts/             ← 环境自动化初始化、测试与发布脚本
├── server/              ← 网关核心后端 (Node.js + TypeScript + SQLite)
│   ├── src/
│   │   ├── db/          ← SQLite 数据库、数据迁移与模型种子数据
│   │   ├── providers/   ← 60+ 上游适配器与协议转换实现
│   │   ├── routes/      ← OpenAI、Anthropic、Gemini、Ollama 与管理接口
│   │   ├── services/    ← 多臂老虎机评分、配额监控、加密金库、Token 节省器
│   │   └── index.ts     ← 服务端主入口文件
├── shared/              ← 共享 TypeScript 类型定义与目录 Schema
├── CONTRIBUTING.md      ← 贡献者开发指南与 PR 规范
├── LICENSE              ← 开源 MIT 许可证
└── package.json         ← Monorepo 工作区定义
```

---

## ✨ 核心特性

- **多协议原生双向翻译：**
  - 完整 OpenAI 表面（`/v1/chat/completions`、`/v1/models`、`/v1/embeddings`、`/v1/images/*` 等）。
  - 原生 Anthropic Messages API（`/v1/messages`），让 Claude Code 丝滑运行。
  - 原生 Google Gemini API（`/v1beta/models/*:generateContent`）。
  - 本地优先 Ollama 仿真，赋能 Zed 与 JetBrains AI。
- **提示词压缩与 Token 节省流水线：**
  - 基于 AST 和正则的非破坏性过滤，智能裁剪嘈杂的工具调用结果（`git diff`、终端日志、文件读取）。
  - 压缩重复 JSON 结构与多余上下文，**节省 20–40% Token 消耗**。
- **六大智能路由策略：**
  - `auto`：兼顾延迟、模型智力与剩余配额的综合最优解。
  - `auto:fast`：优先选择超低延迟提供方（Groq）。
  - `auto:smart`：优先指派高推理能力模型（Gemini 2.5 Pro、Codestral）。
  - `auto:cheap`：保护核心额度，优先调用轻量免密模型。
  - `auto:<profile>`：在仪表盘中自定义的命名降级链。
- **多模型协同合成（Fusion）：**
  - 请求虚拟模型 `fusion`：请求将并行广播给多个不同模型，裁判模型将多个草稿融合成单个最优回答。
- **系统一复杂度闸门（Complexity Gate）：**
  - 启发式前置分类器，简单问答走极速通道，多步骤编程任务自动路由给强力模型。
- **内置 MCP 协议服务器（`/mcp`）：**
  - 支持 ChatGPT、Claude Desktop 与 MCP 客户端直接挂载 SRouter 作为推理与监控工具。
- **高安全本地隐私防护：**
  - 上游密钥采用 **AES-256-GCM** 在本地 SQLite 中加密存储。
  - 您的本地工具只需要掌握一个由 SRouter 生成的统一 `srouter-...` 密钥。
- **支持 60 种语言：**
  - 仪表盘自动感知浏览器语言，并提供完整的阿拉伯语、希伯来语等 RTL 布局支持。

---

## 🛠️ 常用开发命令

| 命令 | 说明 |
| :--- | :--- |
| `npm run dev` | 同时启动服务端（:20268）与前端界面（:5173）并开启热更新 |
| `npm run dev:lan` | 启动允许局域网其他设备访问的开发服务 |
| `npm run build` | 编译构建生产环境的服务端、CLI 与前端客户端 |
| `npm test` | 执行完整测试套件（单元测试、引导测试、Hooks 检查） |
| `npm run lint` | 执行代码规范与 TypeScript 类型检查 |
| `npm run db:migration:up` | 应用所有未执行的 SQLite 数据库迁移 |
| `npm run db:migration:down` | 回滚最新的数据库迁移 |
| `npm run db:migration:create --name=<n>` | 生成新的数据库迁移定义文件 |
| `npm run desktop:dev` | 以开发模式启动 Electron 桌面应用 |
| `npm run desktop:dist:win` | 构建打包 Windows 桌面客户端安装包（`.exe`） |
| `npm run desktop:dist:mac:x64` | 构建打包 macOS Intel 桌面客户端（`.dmg`） |

---

## 🖼️ 仪表盘界面预览

<div align="center">

### 动态模型降级与实时评分
![模型管理](repo-assets/models.png)

### 本地加密密钥库与配额健康
![密钥管理](repo-assets/keys.png)

### 多模态交互式演练场（Playground）
![演练场](repo-assets/playground.png)

### 实时延迟与 Token 消耗分析
![数据分析](repo-assets/analytics.png)

</div>

---

## ⚠️ 常见问题排查（FAQ）

### 1. 端口 20268 已被其他程序占用
可通过 `.env` 变量或命令行参数指定新端口：
```bash
srouter serve --port 20270
```

### 2. 上游返回 429 Too Many Requests 错误
SRouter 会自动对触发限流的密钥进行冷却处理，并将请求无缝切换至降级链上的下一个可用模型。同时建议在仪表盘中开启免密免费模型（如 Kilo 或 OpenCode Free）作为兜底兜底保障。

### 3. 忘记仪表盘登录密码怎么办？
在登录页点击 **"Forgot password?"**。由于 SRouter 运行在本地，单次重置验证码会直接打印在服务端的控制台终端日志中：
```bash
# Docker 用户查看命令:
docker compose logs -f srouter

# 源码或桌面用户:
# 查看终端输出，或打开 ~/.srouter/logs/srouter.log 文件读取 6 位重置码
```

### 4. 数据库文件存储在哪里？
- **全局 CLI / 源码模式：** `~/.srouter/srouter.db`
- **Docker 容器：** 挂载至 `/app/server/data` 的命名卷
- **Windows 桌面客户端：** `%APPDATA%\SRouter\srouter.db`
- **macOS 桌面客户端：** `~/Library/Application Support/SRouter/srouter.db`

---

## 🤝 参与贡献

非常欢迎社区开发者的贡献！无论是新增免费提供方适配器、优化提示词压缩逻辑，还是改进界面多语言翻译：

1. 查阅 **[贡献指南 (CONTRIBUTING.md)](CONTRIBUTING.md)**。
2. 遵守 **[行为准则 (CODE_OF_CONDUCT.md)](CODE_OF_CONDUCT.md)**。
3. 若发现安全隐患，请参考 **[安全政策 (SECURITY.md)](SECURITY.md)** 私下披露。

---

## ❤️ 支持与赞助

如果 SRouter 帮您节省了昂贵的 API 费用、保障了编程心流或提升了工作效率，欢迎赞助支持本项目的持续维护：

[![Trakteer](https://img.shields.io/badge/Trakteer-e11d48?style=for-the-badge&logo=ko-fi&logoColor=white)](https://trakteer.id/baiibayu/tip)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/baiibayu)
[![PayPal](https://img.shields.io/badge/PayPal-0070BA?style=for-the-badge&logo=paypal&logoColor=white)](https://www.paypal.me/baiibayu)

---

## 📄 许可证与免责声明

- **许可证：** 采用自由开源的 [MIT 许可证](LICENSE)。
- **免责声明：** SRouter 专为个人技术探索、原型开发与编程智能体增强而设计。各免费额度的使用受对应上游提供方的服务条款约束。对于关键性生产任务，建议直接采购官方付费企业端点。

<div align="center">
<sub>由 <b>Bayu Indra Sugiharto (<a href="https://github.com/baiibayu">@baiibayu</a>)</b> 与开源社区贡献者倾心打造。</sub>
</div>
