**English** · [简体中文](../../zh-cn/clients/01-agent-clients.md)

# Clients & coding agents

[← Back to README](../README.md) · [Documentation index](../README.md) · [All supported agents](02-supported-agents.md)

- [OpenAI-compatible clients](#openai-compatible-clients)
- [Coding agents](#coding-agents)
- [QwenPaw](#qwenpaw)
- [Native Gemini clients](#native-gemini-clients)
- [Ollama clients](#ollama-clients)
- [Headerless clients](#headerless-clients)
- [MCP server](#mcp-server)
- [VS Code ghost-text autocomplete (Continue)](#vs-code-ghost-text-autocomplete-continue)
- [Context Handoff](#context-handoff)

## OpenAI-compatible clients

Any client that can target an OpenAI-compatible base URL can use SRouter:

- **LangChain, LlamaIndex, official OpenAI SDKs**: set `base_url` to
  `http://localhost:20268/v1` and use the unified key from the dashboard.
- **Local GPU boxes**: add custom OpenAI-compatible endpoints for Ollama,
  llama.cpp, LM Studio, vLLM, or an internal gateway.

## Coding agents

Use the generator instead of hand-editing a client configuration — install once
with `npm install -g @baiibayu/srouter` so `srouter` is on your PATH, or skip the
install and prefix every command with `npx @baiibayu/srouter` instead:

```bash
export SROUTER_API_KEY=<unified-key>   # or pass --api-key on each command
srouter setup-claude --url http://localhost:20268 --dry-run
srouter setup-claude --url http://localhost:20268
srouter setup-dsh --url http://localhost:20268 --api-key <unified-key>
```

`--dry-run` prints a diff. Real writes merge with the existing configuration
and create a timestamped backup first. `--profile <name>` creates a named
Claude/Codex profile. The live `/v1/models` catalog supplies the model ids and
context windows.

| Agent | Automated command | Manual base URL | Wire |
| --- | --- | --- | --- |

| **Claude Code** | `setup-claude` or credential-free-on-disk `launch` | `http://localhost:20268` | Anthropic Messages |
| **Codex CLI** | `setup-codex` or `launch-codex` | `http://localhost:20268/v1` | Responses (`wire_api = "responses"`) |
| **Cline** | `setup-cline` | `http://localhost:20268/v1` | OpenAI Chat |
| **Continue** | `setup-continue` | `http://localhost:20268/v1` | OpenAI Chat / legacy Completions |
| **Aider** | `setup-aider` | `http://localhost:20268/v1` | OpenAI Chat |
| **OpenCode** | `setup-opencode` | `http://localhost:20268/v1` | OpenAI Chat |
| **Goose** | `setup-goose` | `http://localhost:20268/v1` | OpenAI Chat |
| **Qwen Code** | `setup-qwen` | `http://localhost:20268/v1` | OpenAI Chat (native Gemini also works) |
| **Roo Code** | `setup-roo` | `http://localhost:20268/v1` | OpenAI Chat |
| **Kilo Code** | `setup-kilo` | `http://localhost:20268/v1` | OpenAI Chat |
| **Crush** | `setup-crush` | `http://localhost:20268/v1` | OpenAI Chat |
| **DeepSeek Harness** | `setup-dsh` | `http://localhost:20268/v1` | OpenAI Chat (`api: openai-completions`) |
| **MiMo Code** | `setup-mimo` | `http://localhost:20268/v1` | OpenAI Chat |
| **Oh My Pi** | `setup-omp` | `http://localhost:20268/v1` | OpenAI Chat (`api: openai-completions`) |
| **OpenClaw** | `setup-openclaw` | `http://localhost:20268/v1` | OpenAI Chat (`api: openai-completions`) |
| **Hermes Agent** | `setup-hermes` | `http://localhost:20268/v1` | OpenAI Chat (`provider: custom`) |
| **Pi** | `setup-pi` | `http://localhost:20268/v1` | OpenAI Chat (`api: openai-completions`) |
| **Reasonix** | `setup-reasonix` | `http://localhost:20268/v1` | OpenAI Chat (`kind = "openai"`) |
| **Factory Droid** | `setup-droid` | `http://localhost:20268/v1` | OpenAI Chat (`provider: generic-chat-completion-api`) |
| **QwenPaw** | Manual setup | `http://localhost:20268/v1` | OpenAI Chat (`chat.completions`) |
| **Cursor** | `setup-cursor` prints the guide | public `https://…/v1` | OpenAI Chat |
| **Anything else** | `setup-generic` prints a ready block | `http://localhost:20268/v1` | OpenAI Chat |

The root-vs-`/v1` distinction matters: Claude Code expects the server root
because it appends the Anthropic Messages path. OpenAI-compatible clients in
this table—including Cline, Aider, Goose, Codex, Continue, OpenCode, Qwen,

Roo, Kilo, Crush, MiMo Code, Oh My Pi, OpenClaw, Hermes Agent, Pi, Factory Droid, Reasonix, QwenPaw, and DeepSeek Harness—expect their configured
base URL to include `/v1`.

### DeepSeek Harness (`dsh`)

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) keeps
every provider as a route under `llm-pi-ai.providers` in
`$DSH_HOME/settings.yaml` (`~/.dsh` by default). `setup-dsh` adds a
`SRouter` route there — `api: openai-completions`, the gateway's `/v1`
base URL, and the live catalog as the route's `models` list, which DSH
requires for a provider its installed catalog does not ship — and makes
`SRouter/auto` the default model. The key goes into `$DSH_HOME/.env`
(mode 0600) as `SROUTER_API_KEY`, the environment layer DSH reads on its
own, so nothing needs exporting. Both writes are structural merges: other
routes, comments, and settings in the file are left as they were.

```bash
srouter setup-dsh --url http://localhost:20268 --api-key <unified-key>
npx @deepseek-ai/dsh web
```

Settings are hot-reloaded, so a running `dsh` uses the route on its next
request. `--profile <name>` adds a second route (`SRouter-<name>`) without
changing the default model; `--model <id>` pins the default. Routes are
declared text-only — add `input: [text, image]` to a model entry under
`SRouter.models` to send it images. `DSH_HOME` is honoured when set.

### MiMo Code (`mimo`)

[MiMo Code](https://mimo.xiaomi.com/mimocode) is an OpenCode derivative, so it
takes any OpenAI-compatible endpoint as a custom entry under `provider` — an
`npm` package to speak with (`@ai-sdk/openai-compatible`), the credentials in
`options`, and a `models` map. `setup-mimo` writes that entry as `SRouter`
and names `SRouter/<model>` as the default `model`.

The file is `config.json` in MiMo's own global config directory:
`$XDG_CONFIG_HOME/mimocode` (`~/.config/mimocode` on macOS and Linux), or
`$MIMOCODE_HOME/config` when `MIMOCODE_HOME` is set. That directory merges
`config.json`, `mimocode.json` and `mimocode.jsonc` in that order, so the
generated file is the weakest layer and anything you hand-write in
`mimocode.json` still wins. The write itself is a structural merge, so other
providers and settings already in `config.json` are left as they were.

```bash
srouter setup-mimo --url http://localhost:20268
export SROUTER_API_KEY=<unified-key>
mimo
```

The key is referenced as `{env:SROUTER_API_KEY}`, MiMo's own substitution
syntax, so it stays out of the config file. There is no `MIMOCODE_API_KEY` or
`MIMOCODE_BASE_URL`: MiMo's environment variables locate resources and toggle
features, they are not a general fallback for config fields. Each model is
declared with the `limit.context` and `limit.output` pair MiMo's schema
requires, both taken from the live catalog.

### Oh My Pi (`omp`)

[Oh My Pi](https://omp.sh/) is Stencil Labs' terminal coding agent, a fork of
Pi wired into your IDE. It reads `~/.omp/agent/models.yml`, where every key
under `providers` is an OpenAI-compatible endpoint: `api: openai-completions`
speaks the wire, `baseUrl` points at the gateway's `/v1`, and
`discovery: openai-models-list` fills the picker from `GET /v1/models`.
`setup-omp` writes that as the `srouter` provider and names `srouter/<model>`
the `modelRoles.default` in `~/.omp/agent/config.yml`. The write is a
structural merge: other providers in `models.yml` are left as they were, and
a named `--profile` only adds its own provider without changing the default
model — run `omp` and pick it in `/model`.

```bash
srouter setup-omp --url http://localhost:20268 --api-key <unified-key>
omp
```

Install with `curl -fsSL https://omp.sh/install | sh` (or
`bun install -g @oh-my-pi/pi-coding-agent`). `--model <id>` pins the default.

### OpenClaw

[OpenClaw](https://docs.openclaw.ai/) is the always-on personal assistant
that answers on WhatsApp, Telegram, Discord and the other channels its
gateway connects to. It reads one JSON5 document, `~/.openclaw/openclaw.json`,
and every model endpoint is an entry under `models.providers`; a provider its
bundled catalog does not know must spell out `baseUrl`, `api` and a non-empty
`models` list. `setup-openclaw` writes a `SRouter` provider there —
`api: openai-completions`, the gateway's `/v1` base URL, the live catalog as
its `models` list — and makes `SRouter/auto` the default model under
`agents.defaults.model.primary`. The key is referenced as
`${SROUTER_API_KEY}`, OpenClaw's own substitution, and the value goes into
`~/.openclaw/.env` (mode 0600), the global env file OpenClaw loads on its own,
so nothing needs exporting. Both writes are structural merges: other
providers, `fallbacks` on the default model, and every other setting in the
file are left as they were.

```bash
srouter setup-openclaw --url http://localhost:20268 --api-key <unified-key>
npm install -g openclaw@latest --allow-scripts=openclaw
openclaw agent exec --model SRouter/auto "Say hello"   # no gateway daemon needed
```

A running `openclaw gateway` needs a restart to pick the change up.
`--profile <name>` adds a second provider (`SRouter-<name>`) without
changing the default model; `--model <id>` pins the default. OpenClaw sends a
bare SDK user agent to custom endpoints, so the provider carries a static
`User-Agent: openclaw` header — that is what lights the "seen recently" badge
on the Agents page. Models are declared text-only; add `input: ["text",
"image"]` to a model entry under `models.providers.SRouter.models` to send
it images. `OPENCLAW_CONFIG_PATH`, `OPENCLAW_STATE_DIR` and `OPENCLAW_HOME` are
honoured when set.

### Hermes Agent (`hermes`)

[Hermes Agent](https://hermes-agent.nousresearch.com/docs/) is Nous
Research's self-improving agent, in the terminal or behind Telegram, Discord
and the other messengers its gateway serves. `~/.hermes/config.yaml` is its
single source of truth for the endpoint: `OPENAI_BASE_URL` is ignored for
anything but api.openai.com and `OPENAI_API_KEY` is only sent to OpenAI hosts,
so a custom endpoint has to be declared in the `model` block. `setup-hermes`
writes that block — `provider: custom`, `api_mode: chat_completions`, the
gateway's `/v1` as `base_url`, the chosen model as `default` with its
`context_length` from the live catalog — and references the key as
`api_key: "${SROUTER_API_KEY}"`, Hermes's own substitution, with the value
in `~/.hermes/.env` (mode 0600), which Hermes loads on its own. A fresh
install ships `model: ""`, the "not configured" sentinel; replacing it is
exactly what `hermes setup` would do, and it is what lets a headless first
run skip the wizard. Every other key in the file is left as it was.

```bash
srouter setup-hermes --url http://localhost:20268 --api-key <unified-key>
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --skip-setup
hermes -z "Say hello"
```

A running `hermes gateway` needs a restart to pick the change up.
`--profile <name>` adds a `providers.SRouter-<name>` entry instead —
picked inside a chat with `/model custom:SRouter-<name>:auto` — and leaves
the default model alone; `--model <id>` pins the default. Hermes sends a bare
SDK user agent to custom endpoints, so the block carries
`default_headers: { User-Agent: hermes-agent }`, which is what the Agents
page's "seen recently" badge keys on. `HERMES_HOME` is honoured when set.

### Pi (`pi`)

[Pi](https://pi.dev) is a minimal terminal agent harness you extend with your
own extensions, skills and prompt templates. Endpoints it does not ship are

provider entries in `~/.pi/agent/models.json`. `setup-pi` adds a `srouter`
provider there — `api: openai-completions`, the gateway's `/v1` as `baseUrl`,
and every model in the live catalog with its context window, the chosen model
first — then sets `defaultProvider` and `defaultModel` in
`~/.pi/agent/settings.json` so a fresh `pi` starts on it. Pi does not load a
`.env` file of its own, so the key is written into `models.json`, which is
created with mode 0600. Other providers and settings in both files are left
as they were.

```bash

srouter setup-pi --url http://localhost:20268 --api-key <unified-key>
npm install -g @earendil-works/pi-coding-agent
pi -p "Say hello"
```

A running session reloads `models.json` when `/model` is opened.

`--profile <name>` adds a `srouter-<name>` provider instead, picked with
`pi --model srouter-<name>/<model>` or from `/model`, and leaves the
default model alone; `--model <id>` pins the default. Models are declared
text-only with `reasoning: false`. To send images to a vision model, add
`"image"` to its `input`. Pi sends a bare SDK user agent to custom endpoints,
so the provider carries `headers: { "User-Agent": "pi-coding-agent" }`, which
is what the Agents page's "seen recently" badge keys on.
`PI_CODING_AGENT_DIR` is honoured when set.


### Factory Droid (`droid`)

[Factory Droid](https://docs.factory.ai/droid-cli/quickstart) is Factory's
terminal agent. Its BYOK custom models live in the `customModels` array of
`~/.factory/settings.json`, and each entry speaks the OpenAI Chat wire with
`provider: "generic-chat-completion-api"`: `baseUrl` on the gateway's `/v1`,
the unified key as `apiKey`, and the chosen model. `setup-droid` writes that
entry, and a running `droid` session notices the file change on its own —
`settings.json` is watched, so there is no restart.

```bash
srouter setup-droid --url http://localhost:20268 --api-key <unified-key>
droid
```

Pick `custom:<model>` in `/model` to route a session through the gateway.
Other keys in `settings.json` are kept, but the `customModels` array is
replaced as a whole — re-add any other custom models you had. Install with
`curl -fsSL https://app.factory.ai/cli | sh` (or `npm install -g droid`);
`--model <id>` pins the entry.

### Reasonix (`reasonix`)

[Reasonix](https://github.com/esengine/DeepSeek-Reasonix) is a DeepSeek-native
terminal coding agent built around prefix-cache stability. Every endpoint is a
`[[providers]]` entry in `~/.reasonix/config.toml` (`%APPDATA%\reasonix` on
Windows, `$REASONIX_HOME` when set). `setup-reasonix` adds one named
`srouter` — `kind = "openai"`, the gateway's `/v1` as `base_url`, and every
model in the live catalog, the chosen model first — and points `default_model`
at `srouter/<model>`. The entry names its key with
`api_key_env = "SROUTER_API_KEY"`; the value goes to `~/.reasonix/.env`
(0600), which Reasonix loads itself, so nothing needs exporting. Your other
`[[providers]]` entries and settings are left as they were, and a rerun
replaces only the `srouter` entry.

```bash
npx srouter setup-reasonix --url http://localhost:20268 --api-key <unified-key>
npm install -g reasonix
reasonix -p "Say hello"
```

Every catalog model is in `/model` as `srouter/<id>`. `--profile <name>`
adds a `srouter-<name>` entry instead, picked with
`reasonix --model srouter-<name>/<model>`, and leaves the default model
alone; `--model <id>` pins the default. A zero `price` keeps Reasonix's cost
readout at $0. Reasonix Studio only lists the providers in
`[desktop].provider_access` when that list is set, so add `"srouter"` there
(or under Settings → Model → Access). Reasonix sends `Reasonix/<version>` as
its user agent, which is what the Agents page's "seen recently" badge keys on.

### QwenPaw

[QwenPaw](https://github.com/agentscope-ai/QwenPaw) supports custom providers
that use the OpenAI `chat.completions` API. Start SRouter, create or copy a
unified key from its dashboard, then open **Settings → Models** in the QwenPaw
Console:

1. Under **Providers**, choose **Add Provider**.
2. Give it a **Provider ID** such as `SRouter` and a **Provider Name** such
   as `SRouter`, and set the API compatibility mode to OpenAI
   `chat.completions`.
3. Open the new provider's settings and set **Base URL** to
   `http://localhost:20268/v1` and **API Key** to your SRouter unified key.
4. On the provider's models page, add a model. Use `auto` as the **Model ID**
   to let SRouter route the request, or copy a current id from
   `GET http://localhost:20268/v1/models`.
5. Save, then pick the model as the default (or per chat) and send a test
   message.

If QwenPaw runs in a container, `localhost` refers to that container rather
than the host running SRouter. Use a hostname or host-gateway address that
the QwenPaw container can reach, while keeping the `/v1` suffix. Do not put the
unified key in a URL, screenshot, or issue report. See QwenPaw's
[official model configuration guide](https://qwenpaw.agentscope.io/docs/models)
for the current Console field names.

## Native Gemini clients

Gemini CLI and Gemini-lineage clients can speak Google's wire format directly:

```bash
export GOOGLE_GEMINI_BASE_URL=http://localhost:20268
export GEMINI_API_KEY=srouter-your-unified-key
gemini
```

The native surface implements `GET /v1beta/models`, model metadata,
`generateContent`, `streamGenerateContent` (including `?alt=sse`), and
`countTokens`. Authentication accepts `x-goog-api-key`, Bearer, or Gemini's
`?key=` fallback. Prefer the header: query credentials leak into history and
proxy logs.

The **Keys → Agents** tab maps Gemini Pro, Flash, and Flash-Lite family names to
Auto or a pinned catalog model.

## Ollama clients

Ollama emulation is off by default. Enable one of these modes on
**Keys → Agents**:

- `open-loopback`: no key on this machine only. The socket peer must be
  `127.0.0.1`/`::1`; enabling desktop LAN access does not widen it.
  **Docker note:** inside a container the socket peer is the Docker bridge
  IP, not loopback, so this mode refuses even host-local traffic through a
  published port — use `key-required` for Docker deployments.
- `key-required`: clients must send `Authorization: Bearer <unified-key>`.

The exact endpoints are `/api/tags`, `/api/chat`, `/api/generate`, `/api/show`,
`/api/version`, `/api/embed`, and legacy `/api/embeddings`. Streaming uses
newline-delimited JSON, not SSE. Point Zed, JetBrains AI Assistant, or another
Ollama-capable client at `http://localhost:20268`.

## Headerless clients

If a client cannot set headers, create a separately revocable token on
**Keys → Agents** and use:

```text
http://localhost:20268/v1/t/<token>/chat/completions
http://localhost:20268/v1/t/<token>/responses
http://localhost:20268/v1/t/<token>/models
```

The same prefix exposes `/api/chat` and `/api/tags`. Never put the unified API
key in a URL. URL tokens have independent hashes and immediate revocation
because URLs routinely leak into shell history, reverse-proxy logs, and
telemetry.

## MCP server

On top of the OpenAI-compatible API, the router is an **MCP server**: agents can ask a
SRouter model to perform a text task and introspect the gateway mid-session (usable
models and the params each one honors, provider health, usage and cache stats, routing
strategy).

The MCP surface is a setting rather than an always-on endpoint (#925). **Fresh installs
start with it off**; installs that already had provider keys configured when they upgraded
keep it on, so an existing Claude Code or Cline session does not break on upgrade. Toggle
it on the Keys page under **Agent compatibility**, or from the API:

```bash
curl -X PUT http://localhost:20268/api/settings/enable-mcp \
  -H "Authorization: Bearer <dashboard-token>" -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

While it is off, every verb on `/mcp` answers `403` with a JSON-RPC error saying so.

For Claude Code:

```bash
claude mcp add --transport http SRouter http://localhost:20268/mcp \
  --header "Authorization: Bearer srouter-your-unified-key"
```

Any MCP client that speaks Streamable HTTP works the same way: point it at `/mcp` with the
unified key as a Bearer token.

### ChatGPT (private Secure MCP Tunnel)

`ask_SROUTER` makes SRouter directly callable from a ChatGPT conversation. It uses
the same `/v1/chat/completions` implementation as every OpenAI-compatible client, so model
routing, fallback, response caching, prompt compression, token accounting, execution ids,
and redacted provider errors stay consistent. The result includes the answer, requested and
served model, usage, route, fallback trail, cache/compression state, and execution id.

The three relevant settings are deliberately separate:

| Setting | Where it lives | Example |
| --- | --- | --- |
| Base URL | `mcp.server_urls[].url` in tunnel-client | `http://127.0.0.1:20268/mcp` |
| API key | `SROUTER_MCP_AUTHORIZATION` environment variable | `Bearer srouter-...` |
| Default model | SRouter `MCP_INFERENCE_DEFAULT_MODEL` | `auto`, a model id, or `auto:<profile>` |

1. Enable the MCP surface as shown above. Optionally set the default model before starting
   SRouter:

   ```bash
   MCP_INFERENCE_DEFAULT_MODEL=auto
   MCP_INFERENCE_TIMEOUT_MS=120000
   ```

2. Copy [`examples/chatgpt/tunnel-client.yaml.example`](../../../examples/chatgpt/tunnel-client.yaml.example)
   outside the repository or into an ignored local file, replace its non-secret `tunnel_id`,
   and provide both secrets only through the process environment. The SRouter variable
   contains the complete HTTP header value, including `Bearer `:

   ```powershell
   $env:CONTROL_PLANE_API_KEY = '<OpenAI tunnel runtime key>'
   $env:SROUTER_MCP_AUTHORIZATION = 'Bearer <SRouter unified key>'
   tunnel-client doctor --profile-file .\tunnel-client.yaml --explain
   tunnel-client run --profile-file .\tunnel-client.yaml
   ```

   ```bash
   export CONTROL_PLANE_API_KEY='<OpenAI tunnel runtime key>'
   export SROUTER_MCP_AUTHORIZATION='Bearer <SRouter unified key>'
   tunnel-client doctor --profile-file ./tunnel-client.yaml --explain
   tunnel-client run --profile-file ./tunnel-client.yaml
   ```

3. In ChatGPT, enable **Settings → Security and login → Developer mode**. Open the Plugins
   directory, create a developer-mode plugin, choose **Tunnel**, and select the tunnel id.
   Review the discovered tools before saving. Start with `healthcheck`; use
   `ask_SROUTER` for inference and `list_models` when selecting an explicit model.

The tunnel's static MCP headers are sent only to the configured SRouter origin. Do not
put either API key in the YAML file, MCP URL, screenshots, logs, or commits. A public plugin
deployment is a different security model and needs a stable public HTTPS endpoint plus the
authentication required by ChatGPT; the private tunnel above is the local-first path.

SRouter is local-first and single-user by design. Your provider keys stay in
your SQLite database, encrypted at rest, and requests go from your machine to the
upstream providers you enabled.

## VS Code ghost-text autocomplete (Continue)

SRouter exposes `/v1/completions` for editor autocomplete clients that send legacy OpenAI prompt/suffix requests. Example Continue config:

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

## Context Handoff

When SRouter falls over to a different model mid-conversation (quota, rate limit, cooldown), the new model has no idea it is picking up someone else's task. **Context handoff** adds a single compact `system` message to the outbound request that tells the new model exactly that:

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

**Enable it in `.env`:**

```env
SROUTER_CONTEXT_HANDOFF=on_model_switch
```

**How it works:**

- Messages per session are stored in memory (TTL: 3 hours).
- Only injected when the selected model changes for a given session key.
- Not injected on the first request, on same-model continuations, or if a handoff message is already present.
- Session key: `X-Session-Id` header if present, otherwise SHA-1 of the first user message (same as sticky sessions).
- Storage is in-memory only. Nothing is written to disk or logged.

> **Important:** Context Handoff improves continuity for conversations routed through SRouter. It cannot recover provider-internal hidden state or messages that were never sent to the proxy.
