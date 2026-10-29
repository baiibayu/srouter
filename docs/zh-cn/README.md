<div align="center">

# 📖 SRouter 官方文档

### 开发者指南、统一 API 规范与系统架构参考

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](../../LICENSE)
[![兼容 OpenAI](https://img.shields.io/badge/API-OpenAI%20%7C%20Anthropic%20%7C%20Gemini-blue)](api/01-rest-api.md)
[![智能体支持](https://img.shields.io/badge/Agents-Claude%20%7C%20Cursor%20%7C%20Cline%20%7C%20Codex-purple)](clients/01-agent-clients.md)

<p align="center">
  <b>语言 / Language:</b><br/>
  <a href="../en/README.md"><b>🇺🇸 English</b></a> •
  <a href="../id/README.md"><b>🇮🇩 Bahasa Indonesia</b></a> •
  <a href="README.md"><b>🇨🇳 简体中文</b></a>
</p>

</div>

---

## 🧭 文档索引与路线图

欢迎查阅 **SRouter** 官方文档。SRouter 是一款本地优先的高性能智能 AI 网关与路由系统，可将数十个免费 AI 提供方及本地模型统一整合至单一的高可用端点，原生兼容 OpenAI、Anthropic Messages、Google Gemini 和 Ollama 传输协议。

---

## 📚 核心文档分类

### 🚀 1. 安装与部署
- **[安装指南](install/01-install.md):** 涵盖 NPX / 全局 CLI、Docker Compose、生产服务器构建以及局域网 (LAN) 访问配置。
- **[桌面客户端](../../desktop/README.md):** 适用于 macOS (Apple Silicon / Intel) 和 Windows 的原生托盘菜单栏应用。
- **[在 Android (Termux) 上安装](install/02-android-termux.md):** 使用 Node 内置 SQLite 驱动在 Android 设备上本地运行 SRouter。
- **[Docker 部署](../../docker/README.md):** 容器卷管理、安全配置项与数据持久化路径。

### 🤖 2. 编程智能体接入 (Coding Agents)
- **[客户端接入指南](clients/01-agent-clients.md):**
  - **Claude Code:** 原生 `/v1/messages` 接口接入与无凭据持久化启动 (`srouter launch`)。
  - **Cursor & Windsurf:** 基于统一 Base URL 与 `auto` 自动路由接入。
  - **Cline & Roo Code:** 多模型回退链配置。
  - **Codex CLI:** 原生 `/v1/responses` 协议映射。
  - **Zed & JetBrains AI:** 模拟 Ollama Wire 端点连接。
  - **Model Context Protocol (MCP):** 基于 Streamable HTTP 的 `/mcp` 协议接入。
- **[客户端配置文件](clients/02-client-profiles.md):** 为每个智能体定制服务器端强制提示词与采样参数。

### 📡 3. 统一 API 与传输协议
- **[REST API 参考规范](api/01-rest-api.md):**
  - OpenAI 聊天补全 (`/v1/chat/completions`)
  - Anthropic Messages API (`/v1/messages`)
  - Google Gemini 原生 API (`/v1beta/models/*:generateContent`)
  - 决策分类 System One (`/v1/systemone`)
  - 统一网页搜索与抓取 (`/v1/search`, `/v1/fetch`)
  - Ollama 模拟接口 (`/api/chat`, `/api/tags`)
  - 文本向量嵌入 (`/v1/embeddings`) 与多模态生成
- **[幂等性与重试语义](api/02-idempotency.md):** 请求去重与分布式提供方安全重试机制。

### ✂️ 4. 提示词压缩与 Token 节省
- **[提示词压缩管道](compression/01-compression-pipeline.md):**
  - 针对 `git diff`、grep 搜索结果及终端输出的感知结构清理。
  - 紧凑重复 JSON 结构，**通常每个请求可节省 20–40% Token 消耗**。
  - 向上游转发前的自适应上下文截断。

### ⚡ 5. 路由引擎与系统架构
- **[系统架构深度解析](architecture/00-high-level-index.md):**
  - [多臂老虎机评分 (Bandit Scoring)](architecture/01-routing-and-bandit-scoring.md): 基于实时延迟与成功率动态评分。
  - [配额与冷却引擎](architecture/02-quota-and-cooldown-engine.md): 针对 `(提供方, 模型, Key)` 精确追踪 RPM/RPD/TPM。
  - [流式传输管道](architecture/03-streaming-pipeline.md): 超低延迟 SSE 流式穿透与心跳保活。
  - [降级模式与故障转移](architecture/04-degraded-mode-and-failover.md): 自动提供方冷却与级联回退。
  - [签名模型目录同步](architecture/05-catalog-sync.md): 基于 Ed25519 签名的模型清单半自动更新。

### 🔒 6. 回退链配置与运维管理
- **[命名回退链](fallback/01-named-chains.md):** 自定义并管理特定路由链 (`auto:<profile>`)。
- **[出站代理传输](proxy/OVERVIEW.md):** 正向代理与 Cloudflare Fetch Relay 中继协议。
- **[数据库迁移指南](../../server/src/db/README.md):** SQLite Schema 迁移与模型初始化。
- **[贡献者规范](../../CONTRIBUTING.md):** 开发测试流程与 PR 审核标准。

---

<div align="center">
<sub>Crafted with passion by <b>Bayu Indra Sugiharto (<a href="https://github.com/baiibayu/srouter">@baiibayu</a>)</b> & community contributors.</sub>
</div>
