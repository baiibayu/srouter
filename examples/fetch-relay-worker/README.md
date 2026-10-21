<div align="center">

# ☁️ Universal Fetch Relay Worker

### Provider-Agnostic Cloudflare Worker for Outbound Proxying

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/baiibayu/srouter/blob/main/LICENSE)

</div>

---

## 🧭 Overview

This single-file Cloudflare Worker implements the universal fetch-relay protocol documented in [`docs/en/proxy/01-fetch-relay.md`](../../docs/en/proxy/01-fetch-relay.md). It stores no target-site or LLM-provider configuration. Each incoming request supplies its complete public HTTP(S) target through the `Fetch-Relay-Target` header.

---

## 🚀 Deployment

1. **Install Wrangler and log into Cloudflare:**
   ```bash
   npx wrangler login
   ```

2. **Set your private authentication token:**
   ```bash
   npx wrangler secret put RELAY_TOKEN
   ```

3. **Deploy the Worker:**
   ```bash
   npx wrangler deploy
   ```

---

## ⚙️ Configuring SRouter

Add the relay URL and secret to your SRouter `.env` configuration:

```dotenv
PROXY_MODE=fetch-relay
PROXY_URL=https://universal-fetch-relay.<your-subdomain>.workers.dev
FETCH_RELAY_TOKEN=<the-same-RELAY_TOKEN>
```

Alternatively, configure it visually under **Keys $\to$ Outbound Proxy** in the SRouter Web Dashboard. Use the **Test** button to verify connectivity before saving.

---

## 🧪 Direct Smoke Test

Verify your deployed worker with a direct curl request:

```bash
curl https://universal-fetch-relay.<your-subdomain>.workers.dev \
  -H "Fetch-Relay-Authorization: Bearer $RELAY_TOKEN" \
  -H "Fetch-Relay-Target: https://httpbingo.org/anything?relay=smoke" \
  -H "Content-Type: application/json" \
  --data-binary '{"hello":"relay"}'
```

---

## 🛡️ Security & Privacy Boundaries

- **Supported Protocols:** Streams JSON, GraphQL, arbitrary HTTP methods, Server-Sent Events (SSE), and binary uploads.
- **Strict Guardrails:** Rejects `CONNECT`, `TRACE`, URL credentials, IP-literal and local host targets (`127.0.0.1`, `localhost`), fragments, and relay loops.
- **Zero Logging of Secrets:** Cloudflare logs record only request ID, HTTP method, target hostname, HTTP status code, TTFB, and Cloudflare colo — never request bodies, authorization headers, paths, or query tokens.

---

## 📄 License

Open-source under the [MIT License](https://github.com/baiibayu/srouter/blob/main/LICENSE).
Crafted by **[@baiibayu](https://github.com/baiibayu)** & community contributors.
