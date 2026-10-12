[English](../../en/api/CHANGELOG.md) · **简体中文**

# API 域 —— 变更日志

`docs/api/` 的文档修订历史。最近的在前。

## 2026-10-10

- **docs(api): 复杂度门控可从已关联的 provider key 自动检测主机** —— `GET /api/settings/complexity-gate` 现返回 `detectedHosts`（Keys 中有关联 key 的预设 id，按 platform 或 base URL 匹配）与 `jevKeyStored`（仅表示手动覆盖）；当已检测主机的 provider key 可用时 `hasJevApiKey` 为 true。打分器在调用时**直接借用该 key** —— 不向 settings 复制任何内容，响应也从不回显。新增已验证主机预设：**OpenRouter**（`https://openrouter.ai/api/v1/systemone`，模型 `typesafe/jev-1.13`，2026-10-10 实测 HTTP 200）。Models → System One 的主机下拉显示绿色"已检测"标记，key 行显示"自动 — 来自已关联的 provider key"状态文本而非输入框。来源：`server/src/services/complexity-gate.ts`、`server/src/routes/settings.ts`、`client/src/pages/SystemOnePage.tsx`。
- **docs(api): 网页搜索回退链、attempts 与额度计数** —— `POST /v1/web-search` 不再只回退 DuckDuckGo 一次：先试所选后端，再沿固定链继续（DuckDuckGo → SearXNG → TinyFish → Exa → Brave → Tavily；无密钥/无实例 URL 的候选跳过），全部约束在同一个约 25 秒预算内。多次尝试才成功的响应带 `attempts: [{backend, ok, error?}]`；全部失败时以 `502` 上报并拼接每个后端的错误。`GET/PUT /api/settings/web-search` 新增返回 `usage: {daily, monthly}`（本地尝试计数 —— 提供商没有额度查询 API），**模型 → Web** 按后端展示并对照公布的免费额度。来源：`server/src/services/web-search.ts`、`server/src/routes/tools.ts`、`server/src/routes/settings.ts`。
- **docs(api): Exa 与 TinyFish 加入网页搜索；TinyFish 加入抓取链** —— `POST /v1/web-search` 现记录六个后端：DuckDuckGo（默认、免密钥）、SearXNG、Tavily、Brave、**Exa**（免费额度：每月 $10 代金、免卡）与 **TinyFish**（免费：任意余额每天 1.2 万次搜索，一个账户级密钥），并保持自动回退 DuckDuckGo。`POST /v1/fetch` 在已存该密钥时先走 TinyFish 阅读器、再走 Jina（`via: direct|tinyfish|jina`）。状态页链接现深链到 **Keys → Web search**（`/keys?tab=webSearch`）。来源：`server/src/services/web-search.ts`、`server/src/routes/tools.ts`、`server/src/routes/settings.ts`。

## 2026-10-09

- **docs(api): 网页搜索改为多后端** —— `POST /v1/web-search` 现已记录后端选择器（**Keys 页 → Providers → Web search backend**；实时状态见 **模型 → Web Search**）：DuckDuckGo（默认、免密钥）、自托管 SearXNG 实例（JSON 格式），或服务端保存免费额度密钥的 Tavily/Brave；任一后端不可达时自动回退到 DuckDuckGo，`provider` 如实报告真正作答的后端（验证码/限流 → `502` 行为不变）。来源：`server/src/services/web-search.ts`、`server/src/routes/settings.ts`。
- **docs(api): 补充网页搜索与 URL 抓取工具** —— `01-rest-api.md` 新增 `POST /v1/web-search`（免密钥 DuckDuckGo HTML 后端，`max_results` 1–10，限流/验证码页上报为 `502` 而非空结果集）与 `POST /v1/fetch`（仅公网 `http(s)`，含连接前 DNS 解析检查的防 SSRF 守卫，`max_bytes` 1 KiB–2 MiB 硬截断，Jina 阅读器回退，`via: direct|jina`）。两个端点均要求统一推理 key（拒绝仪表盘会话 token），共享 `/v1` 代理限流。来源：`server/src/routes/tools.ts`。

## 2026-08-23 —— 文档重组

- **36850e8** `docs(api): fold API guide into api domain` — `docs/api.md` → `docs/api/01-rest-api.md`，补 `OVERVIEW.md` + `CHANGELOG.md` 脚手架。（经 #979 合入）
