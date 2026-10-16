[English](../../en/clients/01-agent-clients.md) · **简体中文**

# 客户端与编程智能体

[← 返回 README](../README.md) · [文档索引](../README.md)

- [OpenAI 兼容客户端](#openai-兼容客户端)
- [编程智能体](#编程智能体)
- [QwenPaw](#qwenpaw)
- [原生 Gemini 客户端](#原生-gemini-客户端)
- [Ollama 客户端](#ollama-客户端)
- [无头客户端](#无头客户端)
- [MCP 服务器](#mcp-服务器)
- [VS Code 幽灵文本自动完成](#vs-code-幽灵文本自动完成)
- [上下文交接](#上下文交接)

## OpenAI 兼容客户端

任何能指向 OpenAI 兼容 base URL 的客户端都能使用 SRouter：

- **LangChain、LlamaIndex、官方 OpenAI SDK**：把 `base_url` 设为
  `http://localhost:20268/v1`，使用仪表盘里的统一密钥。
- **本地 GPU 盒子**：为 Ollama、llama.cpp、LM Studio、vLLM 或内部网关添加自定义 OpenAI 兼容端点。

## 编程智能体

用生成器代替手改客户端配置 —— 安装一次 `npm install -g @baiibayu/srouter` 后直接使用 `srouter`；或跳过安装，每条命令改用 `npx @baiibayu/srouter` 前缀：

```bash
export SROUTER_API_KEY=<统一密钥>   # 或每条命令传 --api-key
srouter setup-claude --url http://localhost:20268 --dry-run
srouter setup-claude --url http://localhost:20268
srouter setup-dsh --url http://localhost:20268 --api-key <统一密钥>
```

`--dry-run` 打印差异。真实写入会与现有配置合并，并先创建带时间戳的备份。`--profile <name>` 创建一个命名的 Claude/Codex 配置档。实时 `/v1/models` 目录提供模型 id 和上下文窗口。

| 智能体 | 自动化命令 | 手动 base URL | 线上协议 |
| --- | --- | --- | --- |
| **Claude Code** | `setup-claude` 或免凭证 `launch` | `http://localhost:20268` | Anthropic Messages |
| **Codex CLI** | `setup-codex` 或 `launch-codex` | `http://localhost:20268/v1` | Responses (`wire_api = "responses"`) |
| **Cline** | `setup-cline` | `http://localhost:20268/v1` | OpenAI Chat |
| **Continue** | `setup-continue` | `http://localhost:20268/v1` | OpenAI Chat / 旧版 Completions |
| **Aider** | `setup-aider` | `http://localhost:20268/v1` | OpenAI Chat |
| **OpenCode** | `setup-opencode` | `http://localhost:20268/v1` | OpenAI Chat |
| **Goose** | `setup-goose` | `http://localhost:20268/v1` | OpenAI Chat |
| **Qwen Code** | `setup-qwen` | `http://localhost:20268/v1` | OpenAI Chat（原生 Gemini 也可用） |
| **Roo Code** | `setup-roo` | `http://localhost:20268/v1` | OpenAI Chat |
| **Kilo Code** | `setup-kilo` | `http://localhost:20268/v1` | OpenAI Chat |
| **Crush** | `setup-crush` | `http://localhost:20268/v1` | OpenAI Chat |
| **DeepSeek Harness** | `setup-dsh` | `http://localhost:20268/v1` | OpenAI Chat (`api: openai-completions`) |
| **Oh My Pi** | `setup-omp` | `http://localhost:20268/v1` | OpenAI Chat（`api: openai-completions`） |
| **OpenClaw** | `setup-openclaw` | `http://localhost:20268/v1` | OpenAI Chat（`api: openai-completions`） |
| **Hermes Agent** | `setup-hermes` | `http://localhost:20268/v1` | OpenAI Chat（`provider: custom`） |
| **Pi** | `setup-pi` | `http://localhost:20268/v1` | OpenAI Chat（`api: openai-completions`） |
| **Factory Droid** | `setup-droid` | `http://localhost:20268/v1` | OpenAI Chat（`provider: generic-chat-completion-api`） |
| **QwenPaw** | 手动配置 | `http://localhost:20268/v1` | OpenAI Chat (`chat.completions`) |
| **Cursor** | `setup-cursor` 打印指引 | 公共 `https://…/v1` | OpenAI Chat |
| **其他** | `setup-generic` 打印现成配置块 | `http://localhost:20268/v1` | OpenAI Chat |

根路径与 `/v1` 的区别很重要：Claude Code 期望服务器根路径，因为它会追加 Anthropic Messages 路径。本表中兼容 OpenAI 的客户端——包括 Cline、Aider、Goose、Codex、Continue、OpenCode、Qwen、Roo、Kilo、Crush、Oh My Pi、Factory Droid、QwenPaw 和 DeepSeek Harness——期望它们配置的 base URL 包含 `/v1`。

### DeepSeek Harness (`dsh`)

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 把每个提供方都作为一条路由放在
`llm-pi-ai.providers` 下面，文件是 `$DSH_HOME/settings.yaml`（默认 `~/.dsh`）。
`setup-dsh` 在那里添加一条 `SRouter` 路由——`api: openai-completions`、网关的 `/v1` base URL、以及实时目录作为该路由的 `models` 列表（DSH 要求提供方在其自带目录里没有的模型也得列出来）——并把 `SRouter/auto` 设为默认模型。密钥写进 `$DSH_HOME/.env`（权限 0600）作为 `SROUTER_API_KEY`，这是 DSH 自己读取的环境层，所以无需导出。两次写入都是结构化合并：文件里其他的路由、注释、设置保持原样。

```bash
srouter setup-dsh --url http://localhost:20268 --api-key <统一密钥>
npx @deepseek-ai/dsh web
```

设置是热重载的，所以运行中的 `dsh` 下一次请求就会用上这条路由。`--profile <name>` 添加第二条路由（`SRouter-<name>`）而不改变默认模型；`--model <id>` 固定默认值。路由只声明文本——在 `SRouter.models` 下给某模型条目加上 `input: [text, image]` 即可发图。尊重 `DSH_HOME`。

### Oh My Pi（`omp`）

[Oh My Pi](https://omp.sh/) 是 Stencil Labs 的终端编码智能体，Pi 的分支，与 IDE 深度集成。它读取 `~/.omp/agent/models.yml`，其中 `providers` 下的每个键都是一个 OpenAI 兼容端点：`api: openai-completions` 决定协议，`baseUrl` 指向网关的 `/v1`，`discovery: openai-models-list` 会从 `GET /v1/models` 拉取选择器里的模型列表。`setup-omp` 将其写为 `srouter` 提供方，并在 `~/.omp/agent/config.yml` 中把 `modelRoles.default` 设为 `srouter/<模型>`。写入是结构化合并：`models.yml` 里的其他提供方保持原样；带 `--profile <name>` 时只添加各自的提供方、不改动默认模型——运行 `omp` 后在 `/model` 中选择即可。

```bash
srouter setup-omp --url http://localhost:20268 --api-key <统一密钥>
omp
```

用 `curl -fsSL https://omp.sh/install | sh`（或 `bun install -g @oh-my-pi/pi-coding-agent`）安装。`--model <id>` 固定默认模型。

### OpenClaw

[OpenClaw](https://docs.openclaw.ai/) 是常驻运行的个人助理，通过其网关接入 WhatsApp、Telegram、Discord 等渠道。它只读取一份 JSON5 文档 `~/.openclaw/openclaw.json`，每个模型端点都是 `models.providers` 下的一个条目；其自带目录不认识的提供方必须写明 `baseUrl`、`api` 和非空的 `models` 列表。`setup-openclaw` 在那里写入一个 `SRouter` 提供方——`api: openai-completions`、网关的 `/v1` base URL、以及实时目录作为 `models` 列表——并把 `SRouter/auto` 设为 `agents.defaults.model.primary` 的默认模型。密钥以 OpenClaw 自己的替换语法 `${SROUTER_API_KEY}` 引用，值写进 `~/.openclaw/.env`（权限 0600），这是 OpenClaw 自行加载的全局环境文件，所以无需导出。两次写入都是结构化合并：其他提供方、默认模型上的 `fallbacks`、以及文件里的其他设置保持原样。

```bash
srouter setup-openclaw --url http://localhost:20268 --api-key <统一密钥>
npm install -g openclaw@latest --allow-scripts=openclaw
openclaw agent exec --model SRouter/auto "Say hello"   # 无需启动网关守护进程
```

正在运行的 `openclaw gateway` 需要重启才会读到变更。`--profile <name>` 会添加第二个提供方（`SRouter-<name>`）而不改动默认模型；`--model <id>` 固定默认模型。OpenClaw 对自定义端点只发送 SDK 的通用 User-Agent，所以该提供方带有静态的 `User-Agent: openclaw` 请求头——Agents 页面的"最近出现"徽章正是据此点亮。模型默认声明为纯文本；给 `models.providers.SRouter.models` 里的视觉模型加上 `input: ["text", "image"]` 即可发送图片。设置了 `OPENCLAW_CONFIG_PATH`、`OPENCLAW_STATE_DIR`、`OPENCLAW_HOME` 时会被尊重。

### Hermes Agent（`hermes`）

[Hermes Agent](https://hermes-agent.nousresearch.com/docs/) 是 Nous Research 的自我进化智能体，可在终端使用，也可通过其网关接入 Telegram、Discord 等聊天软件。`~/.hermes/config.yaml` 是端点的唯一事实来源：`OPENAI_BASE_URL` 只对 api.openai.com 生效，`OPENAI_API_KEY` 也只会发给 OpenAI 的主机，所以自定义端点必须写在 `model` 块里。`setup-hermes` 写入这个块——`provider: custom`、`api_mode: chat_completions`、网关的 `/v1` 作为 `base_url`、所选模型作为 `default` 并附上来自实时目录的 `context_length`——并以 Hermes 自己的替换语法 `api_key: "${SROUTER_API_KEY}"` 引用密钥，值写进 `~/.hermes/.env`（权限 0600），Hermes 会自行加载。全新安装自带 `model: ""`（"尚未配置"的哨兵值）；替换它正是 `hermes setup` 会做的事，也正是无人值守首次运行能跳过向导的原因。文件里的其他键保持原样。

```bash
srouter setup-hermes --url http://localhost:20268 --api-key <统一密钥>
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --skip-setup
hermes -z "Say hello"
```

正在运行的 `hermes gateway` 需要重启才会读到变更。`--profile <name>` 改为添加 `providers.SRouter-<name>` 条目——在对话里用 `/model custom:SRouter-<name>:auto` 选择——不改动默认模型；`--model <id>` 固定默认模型。Hermes 对自定义端点只发送 SDK 的通用 User-Agent，所以该块带有 `default_headers: { User-Agent: hermes-agent }`，Agents 页面的"最近出现"徽章据此识别。设置了 `HERMES_HOME` 时会被尊重。

### Pi（`pi`）

[Pi](https://pi.dev) 是一个极简的终端智能体框架，可用你自己的扩展、技能和提示词模板来定制。Pi 未内置的端点写在 `~/.pi/agent/models.json` 的 provider 条目里。`setup-pi` 在其中添加 `srouter` provider——`api: openai-completions`、网关的 `/v1` 作为 `baseUrl`，并列出实时目录中的全部模型及其上下文窗口（所选模型排在最前）——再在 `~/.pi/agent/settings.json` 中设置 `defaultProvider` 和 `defaultModel`，让全新启动的 `pi` 直接使用它。Pi 不会自行加载 `.env` 文件，所以密钥直接写入 `models.json`（以 0600 权限创建）。两个文件中的其他 provider 和设置保持原样。

```bash
srouter setup-pi --url http://localhost:20268 --api-key <统一密钥>
npm install -g @earendil-works/pi-coding-agent
pi -p "Say hello"
```

正在运行的会话在打开 `/model` 时会重新加载 `models.json`。`--profile <name>` 改为添加 `srouter-<name>` provider——用 `pi --model srouter-<name>/<model>` 或在 `/model` 中选择——不改动默认模型；`--model <id>` 固定默认模型。模型声明为纯文本、`reasoning: false`；要给视觉模型发送图片，在其 `input` 中加上 `"image"`。Pi 对自定义端点只发送 SDK 的通用 User-Agent，所以该 provider 带有 `headers: { "User-Agent": "pi-coding-agent" }`，Agents 页面的"最近出现"徽章据此识别。设置了 `PI_CODING_AGENT_DIR` 时会被尊重。

### Factory Droid（`droid`）

[Factory Droid](https://docs.factory.ai/droid-cli/quickstart) 是 Factory 的终端智能体。它的 BYOK 自定义模型位于 `~/.factory/settings.json` 的 `customModels` 数组中，每个条目用 `provider: "generic-chat-completion-api"` 走 OpenAI Chat 协议：`baseUrl` 指向网关的 `/v1`、统一密钥作为 `apiKey`、以及所选模型。`setup-droid` 写入该条目；正在运行的 `droid` 会话会自行察觉文件变化——`settings.json` 被监视，无需重启。

```bash
srouter setup-droid --url http://localhost:20268 --api-key <统一密钥>
droid
```

在 `/model` 中选择 `custom:<模型>` 即可让会话经由网关路由。`settings.json` 中的其他键会保留，但 `customModels` 数组会被整体替换——你原有的其他自定义模型需要重新加回。安装：`curl -fsSL https://app.factory.ai/cli | sh`（或 `npm install -g droid`）；`--model <id>` 固定条目。

### QwenPaw

[QwenPaw](https://github.com/agentscope-ai/QwenPaw) 支持使用 OpenAI
`chat.completions` API 的自定义提供方。先启动 SRouter，并从其仪表盘创建或复制统一密钥，
然后在 QwenPaw Console 中打开 **设置 → 模型**：

1. 在 **提供方** 下选择 **添加提供方**。
2. 填写 **提供方 ID**（例如 `SRouter`）和 **提供方名称**（例如 `SRouter`），
   并将 API 兼容模式设为 OpenAI `chat.completions`。
3. 进入该提供方的设置页，将 **Base URL** 设为 `http://localhost:20268/v1`，
   将 **API 密钥** 设为 SRouter 统一密钥。
4. 在该提供方的模型页面添加模型。**模型 ID** 可填 `auto` 让 SRouter 自动路由，
   或从 `GET http://localhost:20268/v1/models` 复制当前可用的模型 id。
5. 保存后把该模型设为默认（或在单次对话中选用），并发一条消息验证。

如果 QwenPaw 在容器中运行，`localhost` 指向的是该容器，而不是运行 SRouter 的宿主机。
请改用 QwenPaw 容器能够访问的主机名或宿主机网关地址，并保留 `/v1` 后缀。不要把统一密钥
放进 URL、截图或 issue 报告。当前 Console 字段名称以 QwenPaw 的
[官方模型配置指南](https://qwenpaw.agentscope.io/docs/models)为准。

## 原生 Gemini 客户端

Gemini CLI 和 Gemini 系客户端能直接说 Google 的线上格式：

```bash
export GOOGLE_GEMINI_BASE_URL=http://localhost:20268
export GEMINI_API_KEY=srouter-your-unified-key
gemini
```

原生面实现了 `GET /v1beta/models`、模型元数据、`generateContent`、`streamGenerateContent`（含 `?alt=sse`）和 `countTokens`。鉴权接受 `x-goog-api-key`、Bearer 或 Gemini 的 `?key=` 兜底。首选头部：查询凭证会泄露进历史和代理日志。

**密钥 → 智能体** 标签页把 Gemini Pro、Flash 和 Flash-Lite 系列名映射到 Auto 或某个固定的目录模型。

## Ollama 客户端

Ollama 模拟默认关闭。在 **密钥 → 智能体** 里启用下列模式之一：

- `open-loopback`：本机免密钥。套接字对端必须是
  `127.0.0.1`/`::1`；启用桌面局域网访问不会扩大此范围。
  **Docker 注意事项：** 容器内套接字对端是 Docker 网桥 IP，不是环回，所以此模式甚至拒绝通过发布端口的宿主机本地流量——Docker 部署请用 `key-required`。
- `key-required`：客户端必须发送 `Authorization: Bearer <统一密钥>`。

确切端点是 `/api/tags`、`/api/chat`、`/api/generate`、`/api/show`、
`/api/version`、`/api/embed` 和旧版 `/api/embeddings`。流式用
换行分隔 JSON，而非 SSE。把 Zed、JetBrains AI Assistant 或其他
支持 Ollama 的客户端指向 `http://localhost:20268`。

## 无头客户端

如果客户端无法设置头部，在 **密钥 → 智能体** 里单独创建一个可撤销的令牌，然后用：

```text
http://localhost:20268/v1/t/<token>/chat/completions
http://localhost:20268/v1/t/<token>/responses
http://localhost:20268/v1/t/<token>/models
```

同一前缀也暴露 `/api/chat` 和 `/api/tags`。永远别把统一 API 密钥放进 URL。URL 令牌有独立哈希和即时撤销，因为 URL 经常泄露进 shell 历史、反向代理日志和遥测。

## MCP 服务器

在推理之上，路由器还是个 **MCP 服务器**：智能体能在会话中途内省它
（可用模型及各模型支持的参数、提供方健康度、用量与缓存统计、
路由策略）。

MCP 接口是一项设置，而非始终开启的端点（#925）。**全新安装默认关闭**；升级时已配置提供方密钥的安装会保持开启，这样已有的 Claude Code 或 Cline 会话不会在升级后中断。可在「密钥」页的**智能体兼容性**里开关，也可以走 API：

```bash
curl -X PUT http://localhost:20268/api/settings/enable-mcp \
  -H "Authorization: Bearer <dashboard-token>" -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

关闭期间，`/mcp` 的所有方法都会返回 `403` 和一条说明用的 JSON-RPC 错误。

对 Claude Code：

```bash
claude mcp add --transport http SRouter http://localhost:20268/mcp \
  --header "Authorization: Bearer srouter-your-unified-key"
```

任何说 Streamable HTTP 的 MCP 客户端都一样：指向 `/mcp`，用统一密钥作 Bearer 令牌。

SRouter 设计为本地优先、单用户。你的提供方密钥留在你的 SQLite 里，静态加密，请求从你的机器直达你启用的上游提供方。

## VS Code 幽灵文本自动完成

SRouter 暴露 `/v1/completions` 给发旧版 OpenAI prompt/suffix 请求的编辑器自动完成客户端。Continue 配置示例：

```yaml
models:
  - name: SRouter Autocomplete
    provider: openai
    model: auto
    apiBase: http://localhost:20268/v1
    apiKey: srouter-your-unified-key
    useLegacyCompletionsEndpoint: true
    roles:
      - autocomplete
```

## 上下文交接

当 SRouter 在对话中途故障转移到另一个模型（额度、限流、冷却），新模型不知道它在接别人的活。**上下文交接**往出站请求里注入一条精简的 `system` 消息，精确告诉新模型这事：

```
SRouter context handoff:
You are taking over an ongoing conversation from another model (groq:llama-3 → google:gemini-flash).
Continue the user's task using the conversation context already provided in this request.
Do not restart the task, re-ask already answered setup questions, or discard prior tool results.
Respect the user's latest message as the highest-priority instruction.

Recent session summary:
User: …
Assistant: …
```

**在 `.env` 里启用：**

```env
SROUTER_CONTEXT_HANDOFF=on_model_switch
```

**工作原理：**

- 每会话消息存在内存里（TTL：3 小时）。
- 只有给定会话键的选中模型变了才注入。
- 首次请求、同模型续写、或已有交接消息时不注入。
- 会话键：有 `X-Session-Id` 头则用它，否则用首条用户消息的 SHA-1（同粘性会话）。
- 存储纯内存。不写磁盘、不记日志。

> **重要：** 上下文交接改善了经由 SRouter 路由的对话的连贯性。它无法恢复提供方内部的隐藏状态，也无法挽回从未发给代理的消息。
