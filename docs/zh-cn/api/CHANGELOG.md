[English](../../en/api/CHANGELOG.md) · **简体中文**

# API 域 —— 变更日志

`docs/api/` 的文档修订历史。最近的在前。

## 2026-10-09

- **docs(api): 补充网页搜索与 URL 抓取工具** —— `01-rest-api.md` 新增 `POST /v1/web-search`（免密钥 DuckDuckGo HTML 后端，`max_results` 1–10，限流/验证码页上报为 `502` 而非空结果集）与 `POST /v1/fetch`（仅公网 `http(s)`，含连接前 DNS 解析检查的防 SSRF 守卫，`max_bytes` 1 KiB–2 MiB 硬截断，Jina 阅读器回退，`via: direct|jina`）。两个端点均要求统一推理 key（拒绝仪表盘会话 token），共享 `/v1` 代理限流。来源：`server/src/routes/tools.ts`。

## 2026-08-23 —— 文档重组

- **36850e8** `docs(api): fold API guide into api domain` — `docs/api.md` → `docs/api/01-rest-api.md`，补 `OVERVIEW.md` + `CHANGELOG.md` 脚手架。（经 #979 合入）
