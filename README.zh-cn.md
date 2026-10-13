<div align="center">

# SRouter

**每月约 150 亿词元。~60 家免费 LLM 提供方。~1,200+ 个免费模型端点。一个 OpenAI 兼容端点。**

把几十家提供方的免费额度，连同任意自建的 OpenAI 兼容聊天、嵌入、图像和音频端点，一起聚合到单个 `/v1` API 之后。密钥加密存储。路由器为每个请求挑选当前可用的最佳模型，某家提供方触发限流时自动转移到下一家，并按密钥跟踪用量，让你始终待在各家的免费额度之内。

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#参与贡献)

**~900+ 个模型系列 · ~1,200+ 个免费端点** —— 完整列表在你的仪表盘「模型」页里浏览

[English](README.md) · **简体中文**

本翻译可能滞后，最新内容以英文 README 为准。

![SRouter 仪表盘 —— 实时路由、每月词元额度与用量统计](repo-assets/github-hero.png)


你的路由器会从签名源自行更新模型目录：新的免费模型、额度变更和兼容性修复，都不需要 `git pull` 就能生效。


</div>

---

## 目录

- [为什么会有这个项目](#为什么会有这个项目)
- [支持的提供方](#支持的提供方)
- [兼容的 CLI 与编程智能体](#兼容的-cli-与编程智能体)
- [横向对比](#横向对比)
- [功能](#功能)
- [快速开始](#快速开始)
- [桌面应用](#桌面应用)
- [兼容 OpenAI 的客户端](#兼容-openai-的客户端)
- [语言](#语言)
- [实时目录](#实时目录)
- [使用 API](#使用-api)
- [截图](#截图)
- [工作原理](#工作原理)
- [局限性](#局限性)
- [参与贡献](#参与贡献)
- [支持项目](#支持项目)
- [免责声明](#免责声明)

**指南：** [安装与部署](docs/zh-cn/install/01-install.md) · [API 参考](docs/zh-cn/api/01-rest-api.md) · [客户端与编程智能体](docs/zh-cn/clients/01-agent-clients.md) · [提示词压缩](docs/zh-cn/compression/01-compression-pipeline.md) · [架构与内部实现](docs/zh-cn/architecture/00-high-level-index.md) · [文档索引](docs/zh-cn/README.md) · [贡献者指南](CONTRIBUTING.md)

> 所有指南都已有中文版，上面的链接指向中文页面；少数页面在英文原文更新后尚未同步，以英文版为准，每页页首都可切换到英文原文。完整的翻译状态见 [这里](docs/zh-cn/OVERVIEW.md#翻译状态)。

## 为什么会有这个项目

如今每家正经的 AI 实验室都提供免费额度：每月几百万词元，每天几千次请求。单独看，每一份都只是个玩具。叠加起来，它们合计约 **每月 150 亿词元** 的可用推理能力，覆盖 **~900+ 个模型系列 / ~1,200+ 个提供方端点**，从小而快的到相当能打的都有。

问题在于手工叠加太痛苦：几十套不同的 SDK，几十种不同的限流规则，几十个请求可能失败的地方。SRouter 把这些收拢成一个 OpenAI 兼容端点。把任意 OpenAI 客户端库指向你的本地服务，它就会在你添加过密钥的提供方之间透明路由。

而且免费额度的格局每周都在变：提供方会上线新模型、下线旧模型，并且不打招呼就调整额度。这些 SRouter 都替你盯着。路由器会自行拉取经过签名的模型目录，所以你的部署不用 `git pull` 也能跟上。保持最新的方式见 [实时目录](#实时目录)。

![叠加后的免费额度 —— ~60 家提供方合计每月约 150 亿词元的免费推理](repo-assets/free-tier.png)

## 支持的提供方

<div align="center">

<sub>一个端点背后约 60 家免费提供方 —— 自带密钥，路由交给它</sub>

<table>
<tr>
<td align="center" width="150"><img src="repo-assets/providers/google.png" width="44" alt="Google"><br/><b>Google</b></td>
<td align="center" width="150"><picture><source media="(prefers-color-scheme: dark)" srcset="repo-assets/providers/groq-dark.png"><img src="repo-assets/providers/groq.png" width="44" alt="Groq"></picture><br/><b>Groq</b></td>
<td align="center" width="150"><picture><source media="(prefers-color-scheme: dark)" srcset="repo-assets/providers/opencode-dark.png"><img src="repo-assets/providers/opencode.png" width="44" alt="OpenCode Zen"></picture><br/><b>OpenCode Zen</b></td>
<td align="center" width="150"><img src="repo-assets/providers/mistral.png" width="44" alt="Mistral"><br/><b>Mistral</b></td>
<td align="center" width="150"><img src="repo-assets/providers/openrouter.png" width="44" alt="OpenRouter"><br/><b>OpenRouter</b></td>
</tr>
<tr>
<td align="center" width="150"><img src="repo-assets/providers/cloudflare.png" width="44" alt="Cloudflare"><br/><b>Cloudflare</b></td>
<td align="center" width="150"><img src="repo-assets/providers/cohere.png" width="44" alt="Cohere"><br/><b>Cohere</b></td>
<td align="center" width="150"><img src="repo-assets/providers/zhipu.png" width="44" alt="Z.ai (Zhipu)"><br/><b>Z.ai（智谱）</b></td>
<td align="center" width="150"><img src="repo-assets/providers/nvidia.png" width="44" alt="NVIDIA"><br/><b>NVIDIA</b></td>
<td align="center" width="150"><img src="repo-assets/providers/huggingface.png" width="44" alt="HuggingFace"><br/><b>HuggingFace</b></td>
</tr>
</table>

</div>

### ⚡ 免密钥

| | | |
|---|---|---|
| [Kilo Gateway](https://app.kilo.ai) | [OVH AI Endpoints](https://endpoints.ai.cloud.ovh.net) | [LLM7](https://llm7.io) |
| [OpenCode Free](https://opencode.ai) | [AI Horde](https://aihorde.net/register)（较慢） | |

### 🌏 需要区域认证 / 特殊注册

| | | |
|---|---|---|
| [ModelScope 魔搭](https://modelscope.cn/my/myaccesstoken) —— Qwen3 · DeepSeek V4 · GLM-5（需要绑定阿里云中国站账号） | [Baidu Qianfan](https://console.bce.baidu.com/qianfan/overview)（需要中国站实名） | [Volcengine Ark](https://console.volcengine.com/ark)（需要中国站实名） |
| [LongCat](https://longcat.chat/platform)（邮箱注册即可） | [iFlytek Spark](https://console.xfyun.cn)（需要中国站实名） | |

### 🔌 免费网关与路由

<details>
<summary>另外 43 家 —— 点击展开</summary>

| | | |
|---|---|---|
| [ACLIDE](https://aclide.com/en/dashboard/api-keys)（共享月度额度） | [Speka](https://speka.me/dashboard/keys)（$1 共享月度额度） | [LLMTR](https://llmtr.com)（零价格路由） |
| [Gizmo](https://gizmoplatforms.com/developers)（月度免费模型请求） | [BlockRun](https://user.blockrun.ai/dashboard/keys)（零价格模型） | [Moondream](https://moondream.ai/c/cloud/api-keys)（$5 共享月度额度） |
| [Nous Portal](https://portal.nousresearch.com)（免费模型） | [OpenTyphoon](https://playground.opentyphoon.ai/api-key)（免费研究展示） | [Plugsky](https://plugsky.com)（免费密钥） |
| [Token Harbor](https://tokenharbor.ai/dashboard/api-keys)（免费路由需先开通） | [Alibaba Model Studio](https://modelstudio.console.alibabacloud.com)（免费额度，国际站） | [Sail Research](https://app.sailresearch.com)（$5/月，需绑支付方式） |
| [ElectronHub](https://app.electronhub.ai)（共享周额度） | [Router9](https://www.router9.com)（共享月度额度） | [Septor Labs](https://septorlabs.com/dashboard)（每日免费模型额度） |
| [CLōD](https://newapp.clod.io)（共享每日免费请求） | [Speechify](https://platform.speechify.ai)（月度免费 TTS） | [BlazeAPI](https://blazeapi.org/dashboard)（每日免费词元） |
| [Lucidity](https://composite.lucidity.sh)（每日免费模型请求） | [Api.Airforce](https://api.airforce)（每日免费请求） | [DreamPrompting](https://dreamprompting.com)（24 小时滚动免费词元） |
| [Waterfall](https://getwaterfall.org)（社区免费模型） | [Logfare](https://logfare.ai)（合理使用免费模型） | [B.AI](https://b.ai)（推广免费模型） |
| [AMD Radeon Cloud](https://developer.amd.com.cn/radeon/tokenfactory)（免费共享模型） | [Ollama Cloud](https://ollama.com/settings/keys) | [Pollinations](https://enter.pollinations.ai) |
| [OpenCode Go](https://opencode.ai/auth)（独立档位） | [Agnes AI](https://platform.agnes-ai.com)（免费密钥） | [Reka](https://platform.reka.ai)（预付费额度） |
| [SiliconFlow](https://siliconflow.com)（图像 + TTS） | [Routeway](https://routeway.ai)（免费密钥） | [BazaarLink](https://bazaarlink.ai)（免费密钥） |
| [AINative](https://ainative.studio)（免费密钥） | [Aion Labs](https://www.aionlabs.ai)（免费密钥） | [Requesty](https://www.requesty.ai)（免费密钥） |
| [NavyAI](https://api.navy)（免费密钥） | [NaraRouter](https://router.bynara.id)（免费密钥） | [SEA-LION](https://sea-lion.ai)（免费密钥） |
| [OrcaRouter](https://www.orcarouter.ai)（免费密钥） | [UnoRouter](https://unorouter.com)（免费密钥） | [xKiro](https://xkiro.com)（免费密钥） |
| [AnyAPI](https://anyapi.ai)（免费密钥） | | |

</details>

此外还有 **自定义** 提供方：在密钥页上，把聊天、嵌入、图像或音频模型指向任意 OpenAI 兼容端点（llama.cpp、LM Studio、vLLM、本地 Ollama，或者一个远程网关）。

完整且始终最新的列表在仪表盘的 **模型** 页里，含每个模型的限流规则、上下文窗口和免费词元额度。

## 兼容的 CLI 与编程智能体

<div align="center">
<table>
<tr>
<td align="center" width="150"><img src="repo-assets/agents/claude-code.png" width="44" alt="Claude Code"><br/><b>Claude Code</b></td>
<td align="center" width="150"><img src="repo-assets/agents/codex.png" width="44" alt="Codex CLI"><br/><b>Codex CLI</b></td>
<td align="center" width="150"><img src="repo-assets/agents/gemini-cli.png" width="44" alt="Gemini CLI"><br/><b>Gemini CLI</b></td>
<td align="center" width="150"><img src="repo-assets/agents/aider.png" width="44" alt="Aider"><br/><b>Aider</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/agents/cline.png" width="44" alt="Cline"><br/><b>Cline</b></td>
<td align="center"><img src="repo-assets/agents/roo-code.png" width="44" alt="Roo Code"><br/><b>Roo Code</b></td>
<td align="center"><img src="repo-assets/agents/continue.png" width="44" alt="Continue"><br/><b>Continue</b></td>
<td align="center"><img src="repo-assets/agents/opencode.png" width="44" alt="OpenCode"><br/><b>OpenCode</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/agents/goose.png" width="44" alt="Goose"><br/><b>Goose</b></td>
<td align="center"><img src="repo-assets/agents/qwen-code.png" width="44" alt="Qwen Code"><br/><b>Qwen Code</b></td>
<td align="center"><img src="repo-assets/agents/kilo-code.png" width="44" alt="Kilo Code"><br/><b>Kilo Code</b></td>
<td align="center"><img src="repo-assets/agents/crush.png" width="44" alt="Crush"><br/><b>Crush</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/agents/cursor.png" width="44" alt="Cursor"><br/><b>Cursor</b></td>
<td align="center"><img src="repo-assets/agents/zed.png" width="44" alt="Zed"><br/><b>Zed</b></td>
<td align="center"><img src="repo-assets/agents/jetbrains.png" width="44" alt="JetBrains AI"><br/><b>JetBrains AI</b></td>
<td align="center"><img src="repo-assets/agents/oh-my-pi.png" width="44" alt="Oh My Pi"><br/><b>Oh My Pi</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/agents/factory-droid.png" width="44" alt="Factory Droid"><br/><b>Factory Droid</b></td>
</tr>
</table>

<i>…… 以及任何兼容 OpenAI 的客户端、Anthropic SDK、Gemini SDK，或支持 Ollama 的应用</i>

</div>

其中大多数一条命令就能配好：`npx srouter setup-claude`、`setup-codex`、`setup-aider`，还有另外十几个生成器。它们会拉取你当前的实时目录，备份已有配置，并且绝不覆盖你已经写好的内容。Claude Code 和 Codex 另有零留存启动器（`srouter launch`、`srouter launch-codex`），只把凭据注入子进程。Zed 和 JetBrains AI 通过可选的 [Ollama 模拟](docs/en/clients/01-agent-clients.md#ollama-clients) 接入；Gemini CLI 走它自己的 `/v1beta` 协议。

各工具的具体配方、setup CLI 参考、给无法发送请求头的客户端用的可撤销 URL 令牌，以及 MCP 服务，都在 **[客户端与编程智能体 →](docs/zh-cn/clients/01-agent-clients.md)**

## 横向对比

![与 OpenRouter、LiteLLM、Portkey 的功能对比](repo-assets/comparison.png)

基于 2026 年 7 月的公开文档整理，欢迎指正。

## 功能

![功能概览](repo-assets/features.png)

- **OpenAI 的全部接口** —— `/v1/chat/completions`、`/v1/responses`（Codex CLI 需要它）、`/v1/completions`（编辑器的幽灵文本补全）、`/v1/images/generations`、`/v1/audio/speech`、`/v1/embeddings` 和 `/v1/models`，流式与非流式均可，来自官方 SDK 或任何 OpenAI 兼容客户端都行。[API 参考 →](docs/zh-cn/api/01-rest-api.md)
- **Anthropic Messages API** —— `/v1/messages` 在同一套路由之上讲 Anthropic 的协议，所以 **Claude Code** 和官方 Anthropic SDK 可以直接跑在你的免费池上。[详情 →](docs/zh-cn/api/01-rest-api.md#anthropic-与-claude-客户端)
- **原生 Gemini 与 Ollama 接口** —— Gemini CLI 可以用 `/v1beta`（`generateContent`、流式、词元计数、模型列表）；可选的 Ollama 模拟则为 Zed、JetBrains 以及其他本地模型客户端提供 NDJSON 的 chat/generate、标签、元数据和嵌入。
- **Fusion（多模型合成）** —— 请求虚拟模型 `fusion`，路由器会把你的提示词并行分发给一组风格各异的免费模型，再由一个评审模型从这些草稿中合成出一个答案。[详情 →](docs/zh-cn/api/01-rest-api.md#fusion-多模型合成)
- **图像生成与文本转语音** —— `/v1/images/generations` 和 `/v1/audio/speech` 会在提供媒体模型的提供方之间路由，也包括自定义的 OpenAI 兼容媒体端点。
- **工具调用与结构化输出** —— OpenAI 风格的 `tools` 可在各提供方之间往返（纯文本形式的工具调用会被救回成真正的 `tool_calls`），另有 `response_format`、`seed`、`logprobs`、惩罚项以及其余采样参数按提供方透传。
- **面向智能体的网页搜索与抓取** —— `POST /v1/web-search` 支持 DuckDuckGo（默认、免密钥）、你自己的 SearXNG 实例或 Tavily/Brave/Exa/TinyFish 免费额度密钥（TinyFish Search 任意余额均免费），后端不可用时自动回退到 DuckDuckGo；`POST /v1/fetch` 把公开网页抓成可读文本（已存 TinyFish 密钥时先走免费的 TinyFish Fetch，再走免费的 Jina Reader）。[API 参考 →](docs/zh-cn/api/01-rest-api.md)
- **复杂度闸门（System One）** —— 可选的路由前打分器，仅凭元数据把请求分为简单或复杂（免密钥启发式开箱即用；换成 Jev、v1m 之类的 System One 兼容端点只需改一个字段），让简单提示走快速通道、复杂请求进入更强的模型。[详情 →](docs/zh-cn/architecture/01-routing-and-bandit-scoring.md)
- **智能路由，六种策略** —— 实时的每模型速度、能力、稳定性评分决定你的链路顺序；遇到 429/5xx 时自动转移到下一个模型，并带冷却和密钥轮换；模型探索（未测量的模型有 10% 概率被排到最前）默认开启，可在仪表盘关闭。[路由详解 →](docs/zh-cn/architecture/00-high-level-index.md#工作原理)
- **统一模型与配置档** —— 同一个模型在多家提供方上会合并成一个条目，并在组内严格故障转移；命名的回退链配置档（比如一条编程链、一条视觉链）可以在仪表盘里切换，也可以按请求用 `auto:<profile>` 指定。
- **按密钥的限流跟踪** —— 以 `(平台, 模型, 密钥)` 为单位的 RPM/RPD/TPM/TPD 计数器，会学习提供方公布的上限，让路由始终不越线。
- **按密钥的预算自动跟随提供方周期** —— 可选的每密钥请求/Token 上限按每日、每周或每月（UTC）窗口计数，周期会**根据提供方目录自动判定**（日限额→每日、月配额→每月、否则回退每月），控制面板会显示检测到的周期；目录元数据缺失的提供方以及每周窗口仍可手动指定。
- **自更新的模型目录** —— 路由器每天两次同步经过签名的目录：新模型、额度变更和提供方的怪癖修复都会自动生效。[实时目录 →](#实时目录)
- **粘性会话与上下文交接** —— 对话会在同一个模型上停留 30 分钟；如果中途确实换了模型，可选的精简交接说明能让话题保持连贯。[详情 →](docs/en/clients/01-agent-clients.md#context-handoff)
- **提示词压缩（可选开启）** —— 一条共享且失败即放行的请求流程，可以在缓存查找和路由之前对提示词去重、过滤工具输出、压紧重复的 JSON，并裁掉过时的上下文。[详情 →](docs/zh-cn/compression/01-compression-pipeline.md)
- **密钥加密存储，对外只有一个令牌** —— 提供方密钥以 AES-256-GCM 加密存放在 SQLite 中，每次请求时在内存里解密；你的应用自始至终只看到一个统一的 `srouter-…` bearer 令牌。
- **管理仪表盘与分析** —— React 界面用来管理密钥、调整链路顺序、使用试验台，并查看 24 小时到 90 天窗口的 p50/p95/首个词元用时分析；带登录保护，支持明暗主题和 [60 种语言](#语言)。
- **MCP 服务与交互式文档** —— 智能体可以通过 `/mcp` 查询可用模型、提供方健康状况和路由策略；`/v1/docs` 提供一个零依赖的 OpenAPI 浏览器。[编程智能体 →](docs/zh-cn/clients/01-agent-clients.md)
- **运维上的便利** —— 可选的响应缓存、加密的数据库备份、定期密钥健康检查、密钥批量导入导出、声明式启动配置。[安装与部署 →](docs/zh-cn/install/01-install.md)
- **能跑 Node 20+ 的地方都能跑** —— Windows、macOS、Linux 服务器，或者一块小小的 ARM 单板机（树莓派也行）。在 PM2 / systemd 或你惯用的守护进程下，空闲时常驻内存约 40 MB。

项目范围是刻意收窄的，参见 [尚不支持的部分](docs/zh-cn/architecture/00-high-level-index.md#尚不支持)。

## 快速开始

**Docker Compose**（需要 Docker）：

```bash
git clone https://github.com/baiibayu/srouter.git && cd srouter
```

按 **[Docker Compose →](docs/zh-cn/install/01-install.md#docker-compose)** 配好 `.env` 并启动容器——里面讲了加密密钥、首次启动和更新方式。重复执行是安全的：`.env` 和你的数据都会保留。

打开 http://localhost:20268 ，在 **密钥** 页添加你的提供方密钥，按喜好调整 **回退链** 的顺序，然后在 **密钥** 页顶部拿到你的统一 API 密钥。这个统一密钥就是你的 OpenAI SDK 要指向的东西。

在 Windows 上，最省事的方式是下面提到的桌面版 **[Releases 里的 `.exe` 安装包](https://github.com/baiibayu/srouter/releases/latest)**。Android 上可参考实验性的 [Termux 指南](docs/zh-cn/install/02-android-termux.md)。

其余内容，包括 Docker Compose、本地开发、声明式启动配置、生产构建、局域网访问和备份，都在 **[docs/zh-cn/install/01-install.md](docs/zh-cn/install/01-install.md)**。

## 桌面应用

[`desktop/`](desktop) 里有一个原生的菜单栏应用：整个路由器加仪表盘就在你的托盘里本地运行，还有一个玻璃质感的悬浮窗显示实时请求统计。

![SRouter 桌面应用](repo-assets/desktop.png)

**[从 Releases 下载](https://github.com/baiibayu/srouter/releases/latest)** —— 每个版本都附带 macOS 的 `.dmg` 和 Windows 的 `.exe` 安装包。不需要注册账号或设置密码：你唯一需要的凭据就是托盘悬浮窗里的统一 API 密钥。从源码构建的步骤，以及数据存放位置，见 [docs/zh-cn/install/01-install.md#桌面应用](docs/zh-cn/install/01-install.md#桌面应用)。

macOS 要求 12 Monterey 或更高版本；Apple Silicon 请选择 **arm64**，Intel 请选择 **x64**。两种 Mac 构建都提供 ZIP 下载。

## 兼容 OpenAI 的客户端

任何能指定 OpenAI 兼容 base URL 的东西都能用：把它设成 `http://localhost:20268/v1`，配上仪表盘里的统一密钥。**Claude Code**、**Codex CLI**、**Cline / Roo Code**、**Continue**（含行内补全）、**Aider**、**opencode** 和 **Cursor** 在 **[docs/zh-cn/clients/01-agent-clients.md](docs/zh-cn/clients/01-agent-clients.md)** 里各有一段简短配方。此外路由器本身还兼作 MCP 服务，你的智能体可以在会话中随时查询它。

最快的配置方式是根据你服务器上实际可用的模型生成：

```bash
npx srouter setup-claude --url http://localhost:20268 --api-key <统一密钥>
```

每个生成器都支持 `--dry-run`，改动已有文件前会先创建带时间戳的备份，并且是合并进用户配置而不是覆盖。启动器则把凭据完全挡在配置文件之外：Claude Code 用 `npx srouter launch`，Codex 用 `npx srouter launch-codex`。

| 智能体 | 自动配置命令 | Base URL |
| --- | --- | --- |
| Claude Code | `setup-claude` | 根路径 |
| Codex CLI | `setup-codex` | `/v1` |
| Cline | `setup-cline` | `/v1` |
| Continue | `setup-continue` | `/v1` |
| Aider | `setup-aider` | `/v1` |
| OpenCode | `setup-opencode` | `/v1` |
| Goose | `setup-goose` | `/v1` |
| Qwen Code | `setup-qwen` | `/v1`（或原生 `/v1beta`） |
| Roo / Kilo / Crush | `setup-roo` / `setup-kilo` / `setup-crush` | `/v1` |
| Cursor | `setup-cursor` 指南 | 公网可达的 `/v1` URL |

SRouter 在设计上是本地优先、单用户的。你的提供方密钥留在你自己的 SQLite 数据库里加密存放，请求从你的机器直接发往你启用的上游提供方。

## 语言

仪表盘提供 **60 种语言**（桌面托盘菜单为 6 种）。界面在首次加载时会自动检测你的浏览器或系统语言，之后随时可以在 **⋯ → 设置** 里切换，选择会被记住。从右往左书写的语言（العربية、עברית、فارسی、اردو）会自动翻转整个布局，并且只有当前语言的词典会被加载，其余的完全不占用你的带宽。

<img src="https://flagcdn.com/24x18/us.png" srcset="https://flagcdn.com/48x36/us.png 2x" width="24" height="18" alt="United States" title="United States"> <img src="https://flagcdn.com/24x18/cn.png" srcset="https://flagcdn.com/48x36/cn.png 2x" width="24" height="18" alt="China" title="China"> <img src="https://flagcdn.com/24x18/es.png" srcset="https://flagcdn.com/48x36/es.png 2x" width="24" height="18" alt="Spain" title="Spain"> <img src="https://flagcdn.com/24x18/fr.png" srcset="https://flagcdn.com/48x36/fr.png 2x" width="24" height="18" alt="France" title="France"> <img src="https://flagcdn.com/24x18/br.png" srcset="https://flagcdn.com/48x36/br.png 2x" width="24" height="18" alt="Brazil" title="Brazil"> <img src="https://flagcdn.com/24x18/it.png" srcset="https://flagcdn.com/48x36/it.png 2x" width="24" height="18" alt="Italy" title="Italy"> <img src="https://flagcdn.com/24x18/in.png" srcset="https://flagcdn.com/48x36/in.png 2x" width="24" height="18" alt="India" title="India"> <img src="https://flagcdn.com/24x18/sa.png" srcset="https://flagcdn.com/48x36/sa.png 2x" width="24" height="18" alt="Saudi Arabia" title="Saudi Arabia"> <img src="https://flagcdn.com/24x18/bd.png" srcset="https://flagcdn.com/48x36/bd.png 2x" width="24" height="18" alt="Bangladesh" title="Bangladesh"> <img src="https://flagcdn.com/24x18/ru.png" srcset="https://flagcdn.com/48x36/ru.png 2x" width="24" height="18" alt="Russia" title="Russia"> <img src="https://flagcdn.com/24x18/pk.png" srcset="https://flagcdn.com/48x36/pk.png 2x" width="24" height="18" alt="Pakistan" title="Pakistan"> <img src="https://flagcdn.com/24x18/id.png" srcset="https://flagcdn.com/48x36/id.png 2x" width="24" height="18" alt="Indonesia" title="Indonesia"> <img src="https://flagcdn.com/24x18/de.png" srcset="https://flagcdn.com/48x36/de.png 2x" width="24" height="18" alt="Germany" title="Germany"> <img src="https://flagcdn.com/24x18/jp.png" srcset="https://flagcdn.com/48x36/jp.png 2x" width="24" height="18" alt="Japan" title="Japan"> <img src="https://flagcdn.com/24x18/ke.png" srcset="https://flagcdn.com/48x36/ke.png 2x" width="24" height="18" alt="Kenya" title="Kenya"> <img src="https://flagcdn.com/24x18/tr.png" srcset="https://flagcdn.com/48x36/tr.png 2x" width="24" height="18" alt="Türkiye" title="Türkiye"> <img src="https://flagcdn.com/24x18/vn.png" srcset="https://flagcdn.com/48x36/vn.png 2x" width="24" height="18" alt="Vietnam" title="Vietnam"> <img src="https://flagcdn.com/24x18/kr.png" srcset="https://flagcdn.com/48x36/kr.png 2x" width="24" height="18" alt="South Korea" title="South Korea"> <img src="https://flagcdn.com/24x18/ir.png" srcset="https://flagcdn.com/48x36/ir.png 2x" width="24" height="18" alt="Iran" title="Iran"> <img src="https://flagcdn.com/24x18/th.png" srcset="https://flagcdn.com/48x36/th.png 2x" width="24" height="18" alt="Thailand" title="Thailand"> <img src="https://flagcdn.com/24x18/pl.png" srcset="https://flagcdn.com/48x36/pl.png 2x" width="24" height="18" alt="Poland" title="Poland"> <img src="https://flagcdn.com/24x18/ua.png" srcset="https://flagcdn.com/48x36/ua.png 2x" width="24" height="18" alt="Ukraine" title="Ukraine"> <img src="https://flagcdn.com/24x18/mm.png" srcset="https://flagcdn.com/48x36/mm.png 2x" width="24" height="18" alt="Myanmar" title="Myanmar"> <img src="https://flagcdn.com/24x18/ro.png" srcset="https://flagcdn.com/48x36/ro.png 2x" width="24" height="18" alt="Romania" title="Romania"> <img src="https://flagcdn.com/24x18/nl.png" srcset="https://flagcdn.com/48x36/nl.png 2x" width="24" height="18" alt="Netherlands" title="Netherlands"> <img src="https://flagcdn.com/24x18/my.png" srcset="https://flagcdn.com/48x36/my.png 2x" width="24" height="18" alt="Malaysia" title="Malaysia"> <img src="https://flagcdn.com/24x18/ph.png" srcset="https://flagcdn.com/48x36/ph.png 2x" width="24" height="18" alt="Philippines" title="Philippines"> <img src="https://flagcdn.com/24x18/ng.png" srcset="https://flagcdn.com/48x36/ng.png 2x" width="24" height="18" alt="Nigeria" title="Nigeria"> <img src="https://flagcdn.com/24x18/et.png" srcset="https://flagcdn.com/48x36/et.png 2x" width="24" height="18" alt="Ethiopia" title="Ethiopia"> <img src="https://flagcdn.com/24x18/uz.png" srcset="https://flagcdn.com/48x36/uz.png 2x" width="24" height="18" alt="Uzbekistan" title="Uzbekistan"> <img src="https://flagcdn.com/24x18/az.png" srcset="https://flagcdn.com/48x36/az.png 2x" width="24" height="18" alt="Azerbaijan" title="Azerbaijan"> <img src="https://flagcdn.com/24x18/lk.png" srcset="https://flagcdn.com/48x36/lk.png 2x" width="24" height="18" alt="Sri Lanka" title="Sri Lanka"> <img src="https://flagcdn.com/24x18/np.png" srcset="https://flagcdn.com/48x36/np.png 2x" width="24" height="18" alt="Nepal" title="Nepal"> <img src="https://flagcdn.com/24x18/kh.png" srcset="https://flagcdn.com/48x36/kh.png 2x" width="24" height="18" alt="Cambodia" title="Cambodia"> <img src="https://flagcdn.com/24x18/gr.png" srcset="https://flagcdn.com/48x36/gr.png 2x" width="24" height="18" alt="Greece" title="Greece"> <img src="https://flagcdn.com/24x18/cz.png" srcset="https://flagcdn.com/48x36/cz.png 2x" width="24" height="18" alt="Czechia" title="Czechia"> <img src="https://flagcdn.com/24x18/hu.png" srcset="https://flagcdn.com/48x36/hu.png 2x" width="24" height="18" alt="Hungary" title="Hungary"> <img src="https://flagcdn.com/24x18/se.png" srcset="https://flagcdn.com/48x36/se.png 2x" width="24" height="18" alt="Sweden" title="Sweden"> <img src="https://flagcdn.com/24x18/il.png" srcset="https://flagcdn.com/48x36/il.png 2x" width="24" height="18" alt="Israel" title="Israel"> <img src="https://flagcdn.com/24x18/dk.png" srcset="https://flagcdn.com/48x36/dk.png 2x" width="24" height="18" alt="Denmark" title="Denmark"> <img src="https://flagcdn.com/24x18/fi.png" srcset="https://flagcdn.com/48x36/fi.png 2x" width="24" height="18" alt="Finland" title="Finland"> <img src="https://flagcdn.com/24x18/no.png" srcset="https://flagcdn.com/48x36/no.png 2x" width="24" height="18" alt="Norway" title="Norway"> <img src="https://flagcdn.com/24x18/sk.png" srcset="https://flagcdn.com/48x36/sk.png 2x" width="24" height="18" alt="Slovakia" title="Slovakia"> <img src="https://flagcdn.com/24x18/bg.png" srcset="https://flagcdn.com/48x36/bg.png 2x" width="24" height="18" alt="Bulgaria" title="Bulgaria"> <img src="https://flagcdn.com/24x18/hr.png" srcset="https://flagcdn.com/48x36/hr.png 2x" width="24" height="18" alt="Croatia" title="Croatia"> <img src="https://flagcdn.com/24x18/rs.png" srcset="https://flagcdn.com/48x36/rs.png 2x" width="24" height="18" alt="Serbia" title="Serbia"> <img src="https://flagcdn.com/24x18/lt.png" srcset="https://flagcdn.com/48x36/lt.png 2x" width="24" height="18" alt="Lithuania" title="Lithuania"> <img src="https://flagcdn.com/24x18/tw.png" srcset="https://flagcdn.com/48x36/tw.png 2x" width="24" height="18" alt="Taiwan" title="Taiwan"> <img src="https://flagcdn.com/24x18/pt.png" srcset="https://flagcdn.com/48x36/pt.png 2x" width="24" height="18" alt="Portugal" title="Portugal"> <img src="https://flagcdn.com/24x18/ge.png" srcset="https://flagcdn.com/48x36/ge.png 2x" width="24" height="18" alt="Georgia" title="Georgia">

完整的语言列表在 [`client/src/i18n/locale-config.ts`](client/src/i18n/locale-config.ts)。

最初的六种语言经过人工校对；较新的那些是机器翻译，并随着母语者提交修正而不断改进。改一个字符串的 PR 就是很好的第一次贡献。

翻译文件以扁平 JSON 的形式放在 [`client/src/i18n/locales/`](client/src/i18n/locales)。想修某个字符串，直接改对应语言 JSON 里的值即可。想加一门语言，复制 `en.json`、翻译其中的值，再到 `client/src/i18n/locale-config.ts` 注册这个语言（托盘文案还需要改 `desktop/src/i18n.ts`）；`npm test` 会检查每种语言的键和占位符是否对齐。欢迎提 PR。

中文的术语约定见 [docs/TRANSLATION.md](docs/TRANSLATION.md)，提交翻译前请先过一遍，这样 README 和仪表盘里的说法能对得上。

## 实时目录

路由器会自行保持模型目录的新鲜：它每天两次拉取经过签名的目录，把新模型、额度变更和提供方的怪癖修复应用到你的本地数据库。你自己的启用/停用选择和自定义提供方永远不会被动到，而且每次下载在应用之前都会用固定的 Ed25519 公钥验签。

目录目前收录 **~60 家提供方**、**~900+ 个模型系列**、**~1,200+ 个免费提供方/模型端点**（1,101 个聊天、79 个嵌入、16 个图像、30 个音频、28 个转录、10 个视频），以及大约 **每月 150 亿词元** 的免费额度容量。完整内容可在仪表盘的 **模型** 页浏览。

这份签名目录以每月快照的形式发布：一个模型要在进入实时源约 30 天后才加入快照，所以你本地的列表会稍稍滞后。什么都不会过期，什么功能都不会被砍——只是到得晚一些。

目录服务器不会看到你的提示词、补全结果或提供方密钥，路由器始终完全自托管。

## 使用 API

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:20268/v1",
    api_key="srouter-your-unified-key",
)

resp = client.chat.completions.create(
    model="auto",  # 交给路由器挑选；也可以用 "auto:fast"、"auto:smart"、某个配置档，或具体的模型 id
    messages=[{"role": "user", "content": "用一句话概括罗马的衰亡。"}],
)
print(resp.choices[0].message.content)
print("Routed via:", resp.headers.get("x-routed-via"))
```

流式、`auto:*` 路由策略、工具调用、视觉输入、Gemini 的 Google 搜索接地、嵌入，以及 Anthropic Messages 接口，连同各自的 curl 和 Python 示例，全都在 **[docs/zh-cn/api/01-rest-api.md](docs/zh-cn/api/01-rest-api.md)**。每个响应都带一个 `X-Routed-Via: <平台>/<模型>` 头，你可以据此看出实际是哪家提供方处理的。

## 截图

### 模型

选一种路由策略，看着每月词元额度在整个提供方队列上被填满。每个模型都显示实时的稳定性、速度和智能评分，下面的顺序就是当前请求的路由顺序。

![模型页](repo-assets/models.png)

### 密钥

管理提供方凭据，并拿到你的应用要用的统一 API 密钥。每个密钥都有一个状态点，以及最近一次健康检查的时间。

![密钥页](repo-assets/keys.png)

### 试验台

通过路由器发一条聊天补全请求，看看是哪家提供方处理的，模型 ID 和延迟就印在消息上。可以用按钮、拖放或粘贴来添加附件：图片（PNG/JPEG/WebP/GIF）会在浏览器里先缩小，再作为图像内容块发给具备视觉能力的模型；文本文件（TXT/MD/CSV/JSON/LOG）则以代码块的形式内联进提示词。

![试验台页](repo-assets/playground.png)

### 分析

请求量、成功率、输入与输出词元、平均延迟，以及按提供方的细分，覆盖 24 小时 / 7 天 / 30 天 / 90 天窗口。

![分析页](repo-assets/analytics.png)

## 工作原理

![一个请求进去，最合适的免费模型出来 —— 带实时评分、冷却和额度跟踪的回退链](repo-assets/router-flow.png)

一个请求进去，最合适的免费模型出来：路由器挑出优先级最高、密钥健康且未超出任何限流的模型，在内存中解密密钥并调用提供方；遇到 429/5xx 就让那个密钥进入冷却，然后重试你链路上的下一个模型。组件走查、路由内部实现和运维细节都在 **[docs/zh-cn/architecture/00-high-level-index.md](docs/zh-cn/architecture/00-high-level-index.md)**。

## 局限性

叠加免费额度是有实实在在的代价的：没有前沿模型，延迟不稳定，没有 SLA。而且到了一天的后半段，顶级模型陆续触及当日上限，这个端点的实际智能水平会下滑，然后在 UTC 午夜重置。在拿它做任何正经东西之前，请先读一遍 **[docs/zh-cn/architecture/00-high-level-index.md#局限性](docs/zh-cn/architecture/00-high-level-index.md#局限性)** 里那份诚实的清单。

## 参与贡献

非常欢迎贡献者！开发流程、PR 要求，以及关于 AI/LLM 辅助贡献的政策（简版：欢迎，质量标准和其他 PR 一样），都在 [CONTRIBUTING.md](CONTRIBUTING.md)。适合上手的第一个 PR：

- **加一家提供方** —— 复制 `server/src/providers/openai-compat.ts` 作为模板，在 `server/src/providers/index.ts` 里接上，在 `server/src/db/index.ts` 里种下它的模型，并在 `server/src/__tests__/providers/` 加一个测试。
- **加一个接口** —— moderations 以及其他 OpenAI 兼容接口。提供方基类可以扩展新方法，各适配器声明自己支持哪些。
- **改进路由** —— 成本感知路由（在最便宜、最健康、最快之间取舍）、更好的延迟加权优先级、区域固定。
- **打磨仪表盘** —— 分析页的图表、密钥轮换的交互、从 `.env` 批量导入密钥。
- **文档** —— 更多示例、Go/Rust 等语言的客户端片段、Docker 或 Fly 的部署配方。

`npm install && npm run dev` 就能起来：服务在 :20268，仪表盘在 :5173，两边都有热更新。PR 应当包含测试、保持现有测试套件通过（`npm test`），并遵循仓库里已有的 `.editorconfig` 和 tsconfig 默认配置。数据库迁移流程和完整的贡献者循环见 [CONTRIBUTING.md](CONTRIBUTING.md)。

### 贡献者

约 130 位贡献者的头像墙维护在[英文 README](README.md#contributors) 里。它几乎每次合并都会变动，所以只保留一份，不在各语言版本中重复。

## 支持项目

如果 SRouter 对你的工作有帮助，请考虑支持开发。每一份贡献都让项目保持活力和成长。

[![Trakteer](https://img.shields.io/badge/Trakteer-e11d48?style=for-the-badge&logo=ko-fi&logoColor=white)](https://trakteer.id/baiibayu/tip)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/baiibayu)
[![PayPal](https://img.shields.io/badge/PayPal-0070BA?style=for-the-badge&logo=paypal&logoColor=white)](https://www.paypal.me/baiibayu)

## 免责声明

**本项目用于个人实验和学习，不适用于生产环境。** 免费额度的存在是为了让开发者拿来做原型；它们不是稳定、有支持的推理基础设施，也不该被当成这种东西。如果你要在 SRouter 之上做真正的产品，上线前请换成付费 API。你和每家上游提供方之间的关系，受你注册账号时接受的条款约束；流量经由本项目代理时这些条款依然适用，遵守它们是你的责任。

各家提供方的服务条款如何看待一个个人的、单用户的代理，在 2026 年 5 月逐家审查过，结论在 [docs/zh-cn/architecture/00-high-level-index.md#服务条款审查](docs/zh-cn/architecture/00-high-level-index.md#服务条款审查)。

## 许可证

[MIT](LICENSE)

---

<sub>本页最初的中文翻译由 [@Robs87](https://github.com/Robs87) 在 [#244](https://github.com/tashfeenahmed/freellmapi/pull/244) 中贡献，本版本已针对当前 README 重新翻译。</sub>
