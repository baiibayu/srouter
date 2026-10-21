<div align="center">

# 🐳 SRouter Docker Guide

### Self-Host SRouter AI Gateway with Docker & Docker Compose

**Deploy SRouter in seconds on home labs, VPS, or cloud servers with SQLite persistence and automated container updates.**

[![Docker Ready](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://github.com/baiibayu/srouter/blob/main/docs/en/install/01-install.md#docker-compose)
[![GHCR](https://img.shields.io/badge/ghcr.io-srouter-blue?logo=github&logoColor=white)](https://github.com/baiibayu/srouter/pkgs/container/srouter)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/baiibayu/srouter/blob/main/LICENSE)
[![Port: 20268](https://img.shields.io/badge/Port-20268-orange)](http://localhost:20268)

<p align="center">
  <a href="#-instant-one-liner-ghcr"><b>⚡ Instant One-Liner</b></a> •
  <a href="#-docker-compose-recommended"><b>🚀 Docker Compose</b></a> •
  <a href="#-example-api-call"><b>📡 API Call</b></a> •
  <a href="#-common-operations"><b>⚙️ Operations</b></a> •
  <a href="#-environment-variables"><b>📋 Environment Variables</b></a> •
  <a href="#-declarative-configuration"><b>📄 Declarative Config</b></a>
</p>

</div>

---

## ⚡ Instant One-Liner (GHCR)

Run SRouter immediately without cloning the git repository:

```bash
docker run -d \
  --name srouter \
  -p 20268:20268 \
  -v srouter-data:/app/server/data \
  -e ENCRYPTION_KEY="$(openssl rand -hex 32)" \
  --restart unless-stopped \
  ghcr.io/baiibayu/srouter:latest
```

The Web Dashboard will be live at 👉 **`http://localhost:20268`**.

---

## 🚀 Docker Compose (Recommended)

Docker Compose is the recommended deployment method for personal servers and home labs. The container bundles the Express gateway API and the built React dashboard into a single lightweight process.

### Step 1: Clone Repository & Create `.env`

```bash
git clone https://github.com/baiibayu/srouter.git
cd srouter

# Generate 32-byte encryption key
ENCRYPTION_KEY="$(openssl rand -hex 32)"
printf "ENCRYPTION_KEY=%s\nPORT=20268\n" "$ENCRYPTION_KEY" > .env
```

### Step 2: Launch Containers

```bash
docker compose up -d
```

Open `http://localhost:20268` in your browser. Configure your provider API keys under the **Keys** tab, or enjoy built-in keyless providers immediately.

---

## 📡 Example API Call

Send a test chat completion through your Dockerized gateway:

```bash
curl http://localhost:20268/v1/chat/completions \
  -H "Authorization: Bearer srouter-your-unified-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "Hello from Docker!"}]
  }'
```

---

## ⚙️ Common Operations

### Check Service Status
```bash
docker compose ps
```

### Tail Server Logs
```bash
docker compose logs -f srouter
```

### Stop Service
```bash
docker compose down
```

### Pull and Apply Image Updates
```bash
docker compose pull
docker compose up -d
```

### Rebuild Locally from Source
```bash
docker compose up -d --build
```

---

## 📋 Environment Variables

| Variable | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `ENCRYPTION_KEY` | **Yes** | *None* | 64-character hex key used to encrypt provider API keys at rest using AES-256-GCM. Keep this stable across restarts. |
| `PORT` | No | `20268` | Host port mapped to the gateway server. |
| `SROUTER_DB_PATH` | No | `/app/server/data/srouter.db` | Path to the SQLite database file inside the container. |
| `SROUTER_DB_BACKUP_PATH` | No | *None* | Local encrypted backup file. Restored on startup if DB is missing, refreshed periodically. |
| `SROUTER_DB_BACKUP_URL` | No | *None* | Remote HTTP(S) encrypted backup target (`GET` on startup, `PUT` on update). |
| `SROUTER_DB_BACKUP_TOKEN` | No | *None* | Bearer token for `SROUTER_DB_BACKUP_URL`. |
| `SROUTER_CONFIG_PATH` | No | *None* | Path to a declarative JSON config file applied idempotently on container startup. |
| `SROUTER_CONFIG_JSON` | No | *None* | Inline JSON configuration string (overrides `SROUTER_CONFIG_PATH`). |

> [!IMPORTANT]
> The `srouter-data` named volume persists database state across container updates at `/app/server/data`. Always retain your `ENCRYPTION_KEY`; if changed, previously stored API keys cannot be decrypted.

---

## 📄 Declarative Configuration

You can provision admin users, provider keys, and custom endpoints automatically upon boot by passing a configuration file (`srouter.config.json`):

```json
{
  "admin": {
    "email": "admin@example.com",
    "password": "change-this-secure-password"
  },
  "keys": [
    { "platform": "groq", "key": "gsk_...", "label": "main" }
  ],
  "customProviders": [
    {
      "baseUrl": "http://host.docker.internal:11434/v1",
      "label": "Ollama Local",
      "models": [
        { "model": "llama3.1:8b", "displayName": "Local Llama", "supportsTools": true }
      ]
    }
  ],
  "routing": {
    "strategy": "balanced"
  }
}
```

---

## 📦 Container Registry

Official multi-arch container images (`linux/amd64`, `linux/arm64`) are published to GitHub Container Registry:

```bash
docker pull ghcr.io/baiibayu/srouter:latest
```

---

## 📄 License

Open-source under the [MIT License](https://github.com/baiibayu/srouter/blob/main/LICENSE).
Created and maintained by **[@baiibayu](https://github.com/baiibayu)** & community contributors.
