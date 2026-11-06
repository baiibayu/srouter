[English](../../en/architecture/07-stealth-and-antiban-architecture.md) · **简体中文**

# 上游隐身与防封禁架构规范

[← 返回架构概览](OVERVIEW.md) · [高层索引](00-high-level-index.md)

本文档规定了 SRouter 在上游隐身、防账号封禁及代理检测规避方面的核心架构标准。作为贡献者在 `server/src/providers/` 中添加或维护提供方适配器的官方技术规范。

---

## 1. 威胁模型与检测层级

现代 AI 网关与反作弊系统（如 Cloudflare Bot Management、Datadome、Akamai 及提供方自研的风控系统）主要通过以下维度检测代理和自动化脚本：

```
┌────────────────────────────────────────────────────────┐
│  第 1 层：出口网络拓扑与行为异常                        │
│  - 针对 OAuth 令牌的 IP 频繁跳跃 (Impossible Travel)    │
│  - 数据中心 ASN 与住宅 IP 属性差异                      │
│  - 多个账户在同一 IP 汇聚引起的协同封禁 (Sybil Alert)    │
├────────────────────────────────────────────────────────┤
│  第 2 层：传输与协议指纹                                │
│  - TLS ClientHello 指纹 (JA3 / JA4)                    │
│  - HTTP/2 帧序与伪头部规范                              │
├────────────────────────────────────────────────────────┤
│  第 3 层：应用层头部与客户端身份标识                    │
│  - 第三方封装库暴露 (ai-sdk, 代理标识)                  │
│  - 代理转发泄露头 (Via, X-Forwarded-*)                 │
│  - User-Agent 与官方工具不一致                          │
│  - 缺少浏览器 Client Hints 或 VSCode 专有元数据         │
├────────────────────────────────────────────────────────┤
│  第 4 层：设备密码学认证与硬件绑定                      │
│  - 非对称设备密钥注册 (Ed25519)                         │
│  - 请求级有效负载数字签名 (Per-request signature)       │
│  - 时间戳时效性与重放防御摘要                           │
├────────────────────────────────────────────────────────┤
│  第 5 层：行为流量与并发控制                            │
│  - 高并发突发 (>3 并发/账户)                            │
│  - 非人类交互速率与零延迟间隔                           │
│  - 对话中途无序切换身份                                 │
└────────────────────────────────────────────────────────┘
```

---

## 2. 核心架构支柱

### 支柱 1：固定出口拓扑与账户亲和性 (Sticky IP)

> **核心原则：** 严禁在同一认证账户的多个请求之间轮换出口 IP。

* **账户绑定固定出口 (Sticky Egress)：** 对于 OAuth 或身份绑定的账户（如 `freebuff`, `kiro`, `cline`, `nous`），所有调用必须固定通过同一个代理节点/出口 IP 发送。同一账户跨地域或跨 IP 频繁变换会直接触发风控系统的异地登录与滥用告警。
* **账户级轮换而非 IP 级轮换：** 当为同一提供方配置多个凭据时，系统轮换的是**账户**，而非单个账户的 IP。每个账户拥有独立的固定出口：
  $$\text{账户}_A \to \text{出口}_1 \quad (\text{固定})$$
  $$\text{账户}_B \to \text{出口}_2 \quad (\text{固定})$$
* **粘性轮换限制 (Sticky Round-Robin Limit)：** 默认保持 3–5 次连续请求在同一账户上，确保多轮会话上下文的连续性。
* **免密端点特例：** 仅对公共/无认证端点（如 `opencode-free`, `pollinations`, `kilo`）开放纯 IP 轮换。

---

### 支柱 2：设备密码学认证 (Ed25519)

部分提供方对免费模式实行官方客户端认证：

* **Ed25519 密钥生成与持久化：** SRouter 在官方 CLI 默认路径（如 `~/.config/manicode/device-key.json`）管理 Ed25519 密钥对。
* **密钥注册握手：** 推理前向上游端点注册公钥以换取 `keyId`。
* **规范化请求签名：** 每个推理请求使用 Ed25519 私钥对规范化文本进行数字签名，并通过以下头部附带发送：
  * `x-freebuff-device-key`
  * `x-freebuff-device-ts`
  * `x-freebuff-device-sig`

---

### 支柱 3：头部清洗与身份伪装

* **全面剥除代理痕迹：** 严禁向上游透传 `x-forwarded-for`、`x-real-ip`、`via` 以及任何包含 SRouter 或第三方 SDK 的字符串。
* **100% 官方客户端身份复制：**
  * **Freebuff (`freebuff`):** `User-Agent: Freebuff-CLI/0.2.35`
  * **Kiro AI (`kiro`):** `User-Agent: aws-toolkit-vscode/1.104.0 (Windows_NT 10.0.19045) VSCode/1.93.0` + AWS 会话头 (`x-amzn-session-id`, `x-amzn-client-id`, `x-amzn-codewhisperer-optout: true`)，针对 AWS Builder ID OIDC 与 CodeWhisperer 原生协议。
  * **Cline (`cline`):** `User-Agent: Cline/3.8.0 vscode/1.93.0`
  * **Nous Portal (`nous`):** `User-Agent: Hermes-Agent/0.2.1 (win32)`
  * **Puter AI (`puter`):** 完整的 Chrome 浏览器 Client Hints 头部。

---

### 支柱 4：并发租约与阶梯式冷却

* **并发控制：** 单个 OAuth 账户并发请求上限严格限制为 2–3。
* **阶梯式冷却：** 遇到 429 速率限制响应时，自动计入 SQLite 持久化阶梯冷却队列（90s → 2m → 10m → 1h → 1d），避免恶性重试被列入黑名单。

---

## 3. SRouter 平台风险分级矩阵

注意：`kiro`（基于 AWS Builder ID OAuth 与 CodeWhisperer 原生协议）与 `xkiro`（`api.xkiro.com` 聚合网关，采用标准开发者 API Key）是两个完全独立的平台：

| 风险级别 | SRouter 平台标识 | 认证与行为特征 | SRouter 强制防御措施 |
|---|---|---|---|
| **第 1 级：高风险** (OAuth / 实名认证 / 有账户免费层) | `freebuff`, `kiro`, `cline`, `nous`, `modelscope`, `qianfan`, `volcengine`, `xfyun` | 严格的反爬检测、设备认证或国内实名认证；零容忍通用代理。`kiro` 强依赖 AWS 账户体系与 CodeWhisperer 会话。 | **每 Key 强制固定 IP**，Ed25519 密码学签名 (Freebuff)，官方 IDE/CLI 头部克隆，单账户并发硬约束 (1–3)。 |
| **第 2 级：中风险** (免密 / 网页端模拟) | `puter`, `opencode-free`, `pollinations`, `kilo`, `ovh`, `llm7`, `aihorde` | 面向网页的公共端点，无个体绑定的匿名算力 | 完整 Chrome Client Hints 伪装，端点速率限流，动态出口池。 |
| **第 3 级：标准** (官方开发者 API Key) | `xkiro`, `google`, `groq`, `openrouter`, `nvidia`, `mistral`, `cohere`, `cloudflare`, `zhipu`, `siliconflow`, `jina`, `router9`, `septor`, `speka`, `auray`, `simplellm`, `waterfall`, `dreamprompting`, `airforce`, `logfare`, `sail`, `electronhub`, `typhoon`, `plugsky`, `tokenharbor`, `codecraft`, `bazaarlink`, `aion`, `requesty`, `navy`, `nara`, `sealion`, `orcarouter`, `unorouter`, `anyapi`, `typesafe` | 专为多租户服务器调用设计的官方商业 API Key。`xkiro` 提供标准 OpenAI 兼容 `/v1` 接口并由 SRouter 进行 1-token 探活 (`probeFreeAccess`)。 | 直连出口（避免不必要的中转节点），标准 HTTP/2 连接池。 |
