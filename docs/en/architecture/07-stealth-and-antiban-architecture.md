**English** · [简体中文](../../zh-cn/architecture/07-stealth-and-antiban-architecture.md)

# Stealth & Anti-Detection Architecture

[← Back to Architecture Overview](OVERVIEW.md) · [High-level index](00-high-level-index.md)

This document specifies SRouter's architectural standards for upstream stealth, anti-ban protection, and proxy detection evasion. It serves as the canonical reference for contributors adding or maintaining provider adapters in `server/src/providers/`.

---

## 1. Threat Model & Detection Vectors

Upstream AI gateways and abuse-prevention systems (e.g., Cloudflare Bot Management, Datadome, Akamai, and proprietary upstream fraud engines) employ distinct layers of telemetry to identify unauthorized proxies, scrapers, and bot automation:

```
┌────────────────────────────────────────────────────────┐
│  Layer 1: Network & Egress Topology                    │
│  - IP Churn / Impossible Travel on OAuth tokens       │
│  - Datacenter ASN vs Residential footprint             │
│  - Multi-account clustering on identical IP endpoints  │
├────────────────────────────────────────────────────────┤
│  Layer 2: Transport & Protocol Fingerprinting          │
│  - TLS ClientHello fingerprinting (JA3 / JA4)          │
│  - HTTP/2 SETTINGS & WINDOW_UPDATE frame ordering      │
│  - Header capitalization, ordering, and pseudo-headers │
├────────────────────────────────────────────────────────┤
│  Layer 3: Application Headers & Client Identity         │
│  - Third-party wrapper headers (`ai-sdk`, proxy names) │
│  - Leaked proxy artifacts (`Via`, `X-Forwarded-*`)     │
│  - User-Agent mismatch against client expectations     │
│  - Missing browser client-hints or VSCode metadata    │
├────────────────────────────────────────────────────────┤
│  Layer 4: Cryptographic Device & Hardware Attestation  │
│  - Asymmetric device key registration (Ed25519)        │
│  - Per-request payload cryptographic signatures        │
│  - Timestamp freshness & replay defense digests        │
├────────────────────────────────────────────────────────┤
│  Layer 5: Behavioral & Traffic Flow Telemetry          │
│  - High burst concurrency (>3 concurrent per account)  │
│  - Unnatural prompt velocity & zero human delay       │
│  - Rapid mid-conversation identity hopping             │
└────────────────────────────────────────────────────────┘
```

---

## 2. Core Architectural Pillars

### Pillar 1: Egress Topology & Account Affinity (Sticky IP)

> **Rule:** Never rotate egress IPs across requests for the same authenticated account.

* **Account-Bound Sticky Egress:** An authenticated OAuth or token-bound account (such as `freebuff`, `kiro`, `cline`, or `nous`) must consistently exit through the **exact same egress IP / relay node**. Alternating IP addresses between requests under a single account triggers automated *Impossible Travel* and *Account Sharing* heuristics, leading to instantaneous account suspension.
* **Account-Level Rotation (Not IP-Level):** When load balancing across multiple credentials for the same provider, rotate between **accounts**, not IPs. Each individual account maintains its own dedicated, persistent egress node:
  $$\text{Account}_A \to \text{Egress}_1 \quad (\text{Sticky})$$
  $$\text{Account}_B \to \text{Egress}_2 \quad (\text{Sticky})$$
* **Sticky Round-Robin Limit:** SRouter uses a sticky round-robin limit (default 3–5 requests) to ensure multi-turn conversation affinity before switching credentials, preventing erratic identity churn.
* **Public / Keyless Exception:** Dynamic IP round-robin is strictly restricted to `noAuth` (public/keyless) utility endpoints (e.g. `opencode-free`, `pollinations`, `kilo`) where no persistent account state or identity exists.

---

### Pillar 2: Cryptographic Hardware & Device Attestation

Certain upstream providers enforce client-side attestation for their free tier access, requiring cryptographic proof that requests originate from official binaries.

* **Ed25519 Key Generation & Storage:**
  SRouter generates and persists an asymmetric Ed25519 keypair in the standard client storage path (e.g., `~/.config/manicode/device-key.json`).
* **Handshake & Public Key Registration:**
  Before dispatching inference requests, the public key is registered with upstream attestation endpoints (`POST /api/v1/.../device-keys`), securing an authenticated `keyId`.
* **Canonical Per-Request Signature:**
  Every completion request signs a canonical multiline payload with the Ed25519 private key:
  ```text
  freebuff-device-v1
  ${HTTP_METHOD}
  ${PATHNAME}
  ${TIMESTAMP_MS}
  ${SHA256_BODY_HEX}
  ```
  The resulting Base64URL signature is transmitted via official attestation headers:
  * `x-freebuff-device-key`: Registered key ID
  * `x-freebuff-device-ts`: Millisecond epoch timestamp
  * `x-freebuff-device-sig`: Ed25519 signature

---

### Pillar 3: Header Hygiene & Fingerprint Masking

All outgoing provider requests must be completely sanitized of proxy artifacts.

1. **Header Scrubbing:**
   Incoming downstream headers must never leak upstream. SRouter explicitly strips:
   * `x-forwarded-for`, `x-forwarded-proto`, `x-forwarded-host`
   * `x-real-ip`, `cf-connecting-ip`, `true-client-ip`
   * `via`, `forwarded`
   * Any client identifiers referencing SRouter, intermediate proxies, or third-party SDKs (such as `ai-sdk` or generic `openai-node` wrappers).

2. **Official Client Personas:**
   Provider adapters must replicate the exact header signature of the official tooling:
   * **Freebuff (`freebuff`):** `User-Agent: Freebuff-CLI/0.2.35`
   * **Kiro AI (`kiro`):** `User-Agent: aws-toolkit-vscode/1.104.0 (Windows_NT 10.0.19045) VSCode/1.93.0` + AWS session headers (`x-amzn-session-id`, `x-amzn-client-id`, `x-amzn-codewhisperer-optout: true`) targeting AWS CodeWhisperer / Bedrock via AWS Builder ID OIDC.
   * **Cline (`cline`):** `User-Agent: Cline/3.8.0 vscode/1.93.0`
   * **Nous Portal (`nous`):** `User-Agent: Hermes-Agent/0.2.1 (win32)`
   * **Puter AI (`puter`):** Complete Chrome Client Hints:
     ```http
     sec-ch-ua: "Chromium";v="131", "Not_A Brand";v="24"
     sec-ch-ua-mobile: ?0
     sec-ch-ua-platform: "Windows"
     Sec-Fetch-Dest: empty
     Sec-Fetch-Mode: cors
     Sec-Fetch-Site: same-origin
     ```

---

### Pillar 4: Concurrency Leases & Traffic Shaping

* **Per-Account Concurrency Cap:**
  Parallel requests sent to a single OAuth account are strictly capped (maximum 2–3 active leases). Burst traffic exceeding normal human developer behavior is queued internally.
* **Proactive Cooldown & Recovery:**
  Upon receiving `429 Too Many Requests` or upstream rate limit signals, the account/model enters an immediate cooldown ladder (90s → 2m → 10m → 1h → 1d) backed by SQLite, preventing retry storms that trigger abuse blacklists.

---

## 3. Provider Risk Classification Matrix (SRouter Platforms)

The matrix below maps the exact platforms configured in SRouter (`shared/providers/platforms.ts` and `server/src/providers/`). Note that `kiro` (AWS Builder ID OAuth to CodeWhisperer) and `xkiro` (OpenAI-compatible aggregator at `api.xkiro.com`) are distinct platforms with completely different architectures:

| Risk Tier | SRouter Platforms | Authentication & Behavioral Profile | Required Mitigations in SRouter |
|---|---|---|---|
| **Tier 1: High Risk** (OAuth / Verified Identity / Free Tier Berakun) | `freebuff`, `kiro`, `cline`, `nous`, `modelscope`, `qianfan`, `volcengine`, `xfyun` | Strict abuse detection, device attestation, or real-name identity verification; zero-tolerance ToS for generic proxies. `kiro` relies on AWS Builder ID OIDC tokens and AWS CodeWhisperer APIs. | **Mandatory Sticky IP per key**, Cryptographic Ed25519 Attestation (Freebuff), Official IDE/CLI User-Agent cloning, AWS session identity headers (`kiro`), Per-account concurrency leasing (1–3 max). |
| **Tier 2: Medium Risk** (Keyless / Web Portal Emulation) | `puter`, `opencode-free`, `pollinations`, `kilo`, `ovh`, `llm7`, `aihorde` | Public web endpoints, anonymous community compute, or browser UI emulations without individual API key bindings | Complete Chrome Client Hints, Browser-grade header ordering, Dynamic egress pooling, Local rate throttling. |
| **Tier 3: Standard** (Official B2B Developer API Keys) | `xkiro`, `google`, `groq`, `openrouter`, `nvidia`, `mistral`, `cohere`, `cloudflare`, `zhipu`, `siliconflow`, `jina`, `router9`, `septor`, `speka`, `auray`, `simplellm`, `waterfall`, `dreamprompting`, `airforce`, `logfare`, `sail`, `electronhub`, `typhoon`, `plugsky`, `tokenharbor`, `codecraft`, `bazaarlink`, `aion`, `requesty`, `navy`, `nara`, `sealion`, `orcarouter`, `unorouter`, `anyapi`, `typesafe` | Contractual developer API keys designed for multi-tenant and server-to-server traffic. `xkiro` provides a standard OpenAI-compatible `/v1` endpoint with token budgets, verified via automated 1-token discovery probes (`probeFreeAccess`). | Direct connection (avoiding unnecessary proxy hops), standard HTTP/2 connection pooling, token-bucket rate limiting. |

---

## 4. Contributor Checklist for New Adapters

When implementing or modifying any provider adapter in `server/src/providers/`:

- [ ] Does the adapter use the **exact** official User-Agent string?
- [ ] Are all generic proxy headers and SDK strings (`ai-sdk`, `srouter`, `proxy`) removed?
- [ ] If the provider requires client attestation (e.g. device keys), is cryptographic signing implemented?
- [ ] Is egress traffic routed through the credential's assigned sticky proxy?
- [ ] Is concurrency properly constrained via the internal lease mechanism?
- [ ] Does the adapter handle 429/403 responses by feeding the cooldown engine rather than immediate tight retries?
