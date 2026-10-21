<div align="center">

# 🚀 SRouter

### Smart AI Gateway & LLM Router Berbasis Komputasi Lokal

**Jangan biarkan sesi coding Anda terhenti karena rate limit (429). Hemat token dengan kompresi prompt + auto-fallback ke ~60 provider AI gratis dan ~1.200+ endpoint model.**

**Hubungkan semua AI Coding Tools (Claude Code, Cursor, Windsurf, Cline, Codex, Copilot, Aider, OpenCode...) ke dalam satu endpoint universal kompatibel OpenAI.**

[![npm version](https://img.shields.io/npm/v/@baiibayu/srouter.svg?color=blue&logo=npm)](https://www.npmjs.com/package/@baiibayu/srouter)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.18.0-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Docker Ready](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](docs/en/install/01-install.md#docker-compose)
[![GHCR](https://img.shields.io/badge/ghcr.io-srouter-blue?logo=github&logoColor=white)](https://github.com/baiibayu/srouter/pkgs/container/srouter)
[![Desktop App](https://img.shields.io/badge/Desktop-Windows%20%7C%20macOS%20%7C%20Linux-blueviolet?logo=electron&logoColor=white)](desktop/)
[![i18n Locales](https://img.shields.io/badge/i18n-60%20Bahasa-orange)](client/src/i18n/locale-config.ts)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)
[![Dukung Developer](https://img.shields.io/badge/Dukung-Developer-ea4aaa?logo=github-sponsors&logoColor=white)](#-donasi--dukungan-pengembang)

<p align="center">
  <a href="#-quick-start"><b>⚡ Quick Start</b></a> •
  <a href="#-integrasi-ai-coding-agents"><b>🤖 Coding Agents</b></a> •
  <a href="#-provider-yang-didukung"><b>🔌 Provider</b></a> •
  <a href="#-endpoint-api-universal"><b>🌐 API Endpoints</b></a> •
  <a href="#️-setup-mcp-server"><b>🛠️ Setup MCP</b></a> •
  <a href="#-mengapa-srouter"><b>🤔 Mengapa SRouter?</b></a> •
  <a href="#-cara-kerja--arsitektur"><b>🔄 Cara Kerja</b></a> •
  <a href="#-fitur-unggulan"><b>✨ Fitur Unggulan</b></a> •
  <a href="#-arsitektur-proyek"><b>🏗️ Struktur Proyek</b></a> •
  <a href="docs/README.md"><b>📚 Dokumentasi</b></a>
</p>

<p align="center">
  <b>Bahasa / Language:</b>
  <a href="README.md"><b>🇺🇸 English</b></a> •
  <a href="README.id.md"><b>🇮🇩 Bahasa Indonesia</b></a> •
  <a href="README.zh-cn.md"><b>🇨🇳 简体中文</b></a> •
  <a href="README.ja.md"><b>🇯🇵 日本語</b></a>
</p>

<p align="center">
  <a href="docs/en/install/01-install.md#docker-compose"><img src="repo-assets/badges/docker.svg" height="42" alt="Self-host dengan Docker"></a>
<a href="https://github.com/baiibayu/srouter/releases/latest/download/SRouter-Setup-win.exe"><img src="repo-assets/badges/windows.svg" height="42" alt="Download untuk Windows"></a>
<a href="https://github.com/baiibayu/srouter/releases/latest/download/SRouter-mac-arm64.dmg"><img src="repo-assets/badges/macos-arm64.svg" height="42" alt="Download untuk macOS (Apple Silicon)"></a>
<a href="https://github.com/baiibayu/srouter/releases/latest/download/SRouter-mac-x64.dmg"><img src="repo-assets/badges/macos-x64.svg" height="42" alt="Download untuk macOS (Intel)"></a>
<a href="https://github.com/baiibayu/srouter/releases/latest/download/SRouter.AppImage"><img src="repo-assets/badges/linux.svg" height="42" alt="Download untuk Linux"></a>
</p>

![Dashboard SRouter — live routing, kalkulasi kuota bulanan, dan analitik penggunaan](repo-assets/github-hero.png)

*Router Anda memperbarui katalog modelnya secara otomatis 2x sehari dari signed feed terenkripsi: model gratis baru, pembaruan kuota, dan perbaikan kompatibilitas masuk secara otomatis tanpa perlu `git pull` manual.*

</div>

---

## 🤔 Mengapa SRouter?

Penggunaan AI Coding Agent (seperti Claude Code, Cursor, Windsurf, Cline) kini menjadi standar baru software engineering, namun developer kerap menghadapi hambatan berikut:

| ❌ Masalah Nyata di Lapangan | ✅ Solusi Cerdas SRouter |
| :--- | :--- |
| **Kuota Langganan Terbuang:** Jatah kuota bulanan provider berbayar sering tersisa atau hangus tanpa termanfaatkan optimal. | **Maksimalkan Tiap Token:** SRouter menghabiskan kuota prioritas terlebih dahulu, kemudian mengalihkan beban secara cerdas. |
| **Terhenti karena Rate Limit (429):** Satu prompt panjang atau eksekusi berkali-kali seketika menghentikan sesi coding Anda. | **Smart 3-Tier Auto-Fallback:** Peralihan otomatis seketika (*Subscription → Budget Model → 100% Free Keyless*) tanpa downtime. |
| **Boros Token pada Output Terminal:** Log `git diff`, `grep`, hasil compile, dan JSON berulang menguras batas konteks (context window). | **Kompresi Prompt & Token Saver:** Filter heuristik dan sadar-struktur bawaan memangkas output alat yang bising, **umumnya menghemat 20–40% token**. |
| **Fragmentasi Puluhan SDK:** Menghubungkan 50+ provider membutuhkan konfigurasi SDK, format auth, dan base URL yang berbeda-beda. | **Satu Endpoint Universal `/v1`:** Cukup arahkan ke `http://localhost:20268/v1` yang mendukung OpenAI, Anthropic (`/v1/messages`), Gemini (`/v1beta`), dan emulasi Ollama. |
| **Batas Free Tier Sering Berubah:** Provider sering menambah, mengurangi kuota, atau menghentikan model gratis tanpa pemberitahuan. | **Katalog Model Sinkron Otomatis:** Signed feed terverifikasi Ed25519 memperbarui katalog ~1.200+ model ke database lokal dua kali sehari. |
| **Kekhawatiran Keamanan & Privasi:** Mengirim API key ke proxy pihak ketiga di cloud berisiko membocorkan rahasia kredensial Anda. | **100% Lokal & Terenkripsi AES-256-GCM:** Semua API key tersimpan aman di SQLite lokal Anda. Trafik AI dikirim langsung dari komputer Anda ke provider asal. |

![Perbandingan SRouter vs OpenRouter, LiteLLM, dan Portkey — satu router, kunci milik Anda, tanpa markup](repo-assets/comparison.png)

---

## 🔄 Cara Kerja & Arsitektur

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Alat & Editor Koding Anda (AI Agents)                    │
│       (Claude Code, Cursor, Windsurf, Cline, Roo Code, Codex, Aider)        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ http://localhost:20268/v1
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Gateway Cerdas SRouter                              │
│  • Complexity Gate (Analisis heuristik: rute instan vs model penalaran)     │
│  • Prompt Compressor & Token Saver (Pembersih log terminal & JSON bising)   │
│  • Translasi Protokol (OpenAI ↔ Anthropic Messages ↔ Gemini ↔ Ollama)       │
│  • Pelacak Kuota & Rate-Limit (RPM / RPD / TPM dengan reset otomatis)       │
│  • Brankas Kredensial Lokal Terenkripsi AES-256-GCM (SQLite)                │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
 ┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
 │  Tier 1: Cepat / Utama   │   │   Tier 2: Kuota Besar    │   │ Tier 3: 100% Free / Anon │
 │  • Google Gemini 2.5     │   │  • Mistral / Codestral   │   │  • Kilo Gateway (No Key) │
 │  • Groq (Llama 3.3 70B)  │──►│  • Zhipu GLM-4 / CogView │──►│  • OpenCode Free (No Key)│
 │  • Pollinations (Gratis) │   │  • Cloudflare Workers AI │   │  • OVH Endpoints (No Key)│
 │  • OpenRouter / DeepSeek │   │  • Cohere / NVIDIA NIM   │   │  • LLM7 / AI Horde       │
 └──────────────────────────┘   └──────────────────────────┘   └──────────────────────────┘
```

Saat sebuah permintaan dikirim dari editor Anda, SRouter memilih model berprioritas tertinggi yang sehat dan belum mencapai batas rate limit. Jika provider merespons dengan kode status `429` atau `5xx`, SRouter **secara otomatis mendinginkan key tersebut dan langsung mengalihkan (failover) request ke model terbaik berikutnya** dalam antrean fallback Anda tanpa menghentikan koding Anda.

![Bagaimana SRouter merutekan satu request melalui rantai fallback ber-skor live](repo-assets/router-flow.png)

---

## ⚡ Quick Start

Pilih metode instalasi yang paling sesuai dengan lingkungan kerja Anda:

### Metode 1: Global CLI / NPX (Paling Praktis)

Jalankan SRouter di mana saja selama Node.js versi 20+ terpasang, tanpa perlu clone repositori:

```bash
# Pasang sekali secara global
npm install -g @baiibayu/srouter
srouter

# Atau jalankan langsung via npx (tanpa instalasi permanen)
npx @baiibayu/srouter
```

Dashboard web akan otomatis terbuka di browser pada alamat `http://localhost:20268`.

---

### Metode 2: Docker Compose (Disarankan untuk Server / Home Lab)

```bash
# 1. Clone repositori
git clone https://github.com/baiibayu/srouter.git
cd srouter

# 2. Salin template environment dan jalankan container
cp .env.example .env
docker compose up -d

# Atau jalankan langsung via image GHCR (tanpa clone):
# docker run -d --name srouter -p 20268:20268 -v srouter-data:/app/server/data ghcr.io/baiibayu/srouter:latest
```

- **Akses Dashboard:** `http://localhost:20268`
- **Endpoint API OpenAI:** `http://localhost:20268/v1`

---

### Metode 3: Aplikasi Desktop (Windows & macOS)

Lebih suka aplikasi GUI mandiri dengan menu system tray / taskbar?

1. Buka halaman **[Releases](https://github.com/baiibayu/srouter/releases/latest)**.
2. Unduh file instalasi:
   - **Windows:** File installer `SRouter-Setup-x.x.x.exe`
   - **macOS:** File `SRouter-x.x.x-arm64.dmg` (Apple Silicon) atau `x64.dmg` (Intel).
3. Jalankan aplikasi. SRouter akan aktif di system tray dengan menu popover transparan yang menampilkan status request langsung serta Unified API Key Anda.

---

### Metode 4: Menjalankan dari Source Code (Pengembangan Lokal)

```bash
# 1. Clone repositori & pasang dependensi
git clone https://github.com/baiibayu/srouter.git
cd srouter
npm install

# 2. Jalankan migrasi database SQLite
npm run db:migration:up

# 3. Jalankan server development (Server :20268 + Client :5173 dengan HMR)
npm run dev
```

Buka peramban Anda dan kunjungi:
👉 **`http://localhost:20268`** (Web Dashboard).

---

## 🤖 Integrasi AI Coding Agents

SRouter menyediakan generator otomatis (`setup-*`) yang langsung memeriksa model aktif di router Anda, membuat salinan cadangan (*backup*) konfigurasi lama, dan menulis file pengaturan yang sesuai untuk tiap alat:

<div align="center">

<table>
<tr>
<td align="center"><img src="repo-assets/agents/claude-code.png" width="64" alt="Claude Code"><br/><b>Claude Code</b></td>
<td align="center"><img src="repo-assets/agents/cursor.png" width="64" alt="Cursor"><br/><b>Cursor</b></td>
<td align="center"><img src="repo-assets/agents/codex.png" width="64" alt="Codex CLI"><br/><b>Codex CLI</b></td>
<td align="center"><img src="repo-assets/agents/cline.png" width="64" alt="Cline"><br/><b>Cline</b></td>
<td align="center"><img src="repo-assets/agents/continue.png" width="64" alt="Continue"><br/><b>Continue</b></td>
<td align="center"><img src="repo-assets/agents/aider.png" width="64" alt="Aider"><br/><b>Aider</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/agents/opencode.png" width="64" alt="OpenCode"><br/><b>OpenCode</b></td>
<td align="center"><img src="repo-assets/agents/gemini-cli.png" width="64" alt="Gemini CLI"><br/><b>Gemini CLI</b></td>
<td align="center"><img src="repo-assets/agents/roo-code.png" width="64" alt="Roo Code"><br/><b>Roo Code</b></td>
<td align="center"><img src="repo-assets/agents/kilo-code.png" width="64" alt="Kilo Code"><br/><b>Kilo Code</b></td>
<td align="center"><img src="repo-assets/agents/zed.png" width="64" alt="Zed"><br/><b>Zed</b></td>
<td align="center"><img src="repo-assets/agents/jetbrains.png" width="64" alt="JetBrains"><br/><b>JetBrains</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/agents/goose.png" width="64" alt="Goose"><br/><b>Goose</b></td>
<td align="center"><img src="repo-assets/agents/qwen-code.png" width="64" alt="Qwen Code"><br/><b>Qwen Code</b></td>
<td align="center"><img src="repo-assets/agents/crush.png" width="64" alt="Crush"><br/><b>Crush</b></td>
<td align="center"><img src="repo-assets/agents/factory-droid.png" width="64" alt="Factory Droid"><br/><b>Factory Droid</b></td>
<td align="center"><img src="repo-assets/agents/openclaw.png" width="64" alt="OpenClaw"><br/><b>OpenClaw</b></td>
<td align="center"><img src="repo-assets/agents/deepseek-harness.png" width="64" alt="DeepSeek Harness"><br/><b>DeepSeek Harness</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/agents/oh-my-pi.png" width="64" alt="Oh My Pi"><br/><b>Oh My Pi</b></td>
<td align="center"><img src="repo-assets/agents/hermes-agent.png" width="64" alt="Hermes"><br/><b>Hermes</b></td>
<td align="center"><img src="repo-assets/agents/pi.png" width="64" alt="Pi"><br/><b>Pi</b></td>
<td align="center"><img src="repo-assets/agents/atomcode.png" width="64" alt="AtomCode"><br/><b>AtomCode</b></td>
</tr>
</table>

</div>

```bash
# Konfigurasi otomatis untuk Claude Code
srouter setup-claude --url http://localhost:20268 --api-key <unified-key-anda>
```

_Belum install? Jalankan perintah yang sama dengan `npx @baiibayu/srouter` menggantikan `srouter`._

| Alat / Agent | Perintah Setup Otomatis | Target Base URL | Dukungan Format Protokol |
| :--- | :--- | :--- | :--- |
| **Claude Code** | `srouter setup-claude` atau `srouter launch` | `http://localhost:20268` | Asli format `/v1/messages` Anthropic |
| **Cursor / Windsurf** | `srouter setup-cursor` (atau manual) | `http://localhost:20268/v1` | Format OpenAI Chat Completions |
| **Cline** | `srouter setup-cline` | `http://localhost:20268/v1` | Format OpenAI / Anthropic |
| **Roo Code / Kilo** | `srouter setup-roo` / `setup-kilo` | `http://localhost:20268/v1` | Format OpenAI Chat Completions |
| **Codex CLI** | `srouter setup-codex` atau `srouter launch-codex` | `http://localhost:20268/v1` | Asli format `/v1/responses` |
| **Aider** | `srouter setup-aider` | `http://localhost:20268/v1` | Format OpenAI Chat Completions |
| **Continue.dev** | `srouter setup-continue` | `http://localhost:20268/v1` | Chat + Ghost-text autocomplete |
| **OpenCode** | `srouter setup-opencode` | `http://localhost:20268/v1` | Format OpenAI Chat Completions |
| **Gemini CLI** | Asli `/v1beta` | `http://localhost:20268` | Asli format `generateContent` Gemini |
| **Zed / JetBrains AI** | Emulasi Ollama | `http://localhost:20268` | Asli format NDJSON Ollama API |

<details>
<summary><b>Lihat Contoh Konfigurasi Cepat (Klik untuk membuka)</b></summary>

### Menjalankan Claude Code Tanpa Simpan Key di Disk
```bash
# Menyuntikkan kredensial sementara langsung ke child process
srouter launch
```

### Konfigurasi Cursor / Windsurf
```json
{
  "openai.baseUrl": "http://localhost:20268/v1",
  "openai.apiKey": "srouter-unified-key-anda",
  "openai.model": "auto"
}
```

### Contoh Pemanggilan via Python SDK
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:20268/v1",
    api_key="srouter-unified-key-anda",
)

response = client.chat.completions.create(
    model="auto:smart",  # atau "auto:fast", "auto", atau ID model tertentu
    messages=[{"role": "user", "content": "Jelaskan konsep concurrency di Go."}],
)

print(response.choices[0].message.content)
print("Dilayani melalui provider:", response.headers.get("x-routed-via"))
```

</details>

---

## 🔌 Provider yang Didukung

SRouter menyatukan **~60 provider** dan **~1.200+ endpoint model** di balik satu endpoint `/v1`.

![Free tier bertumpuk — ~60 provider, ~1.200+ endpoint model gratis, ~900+ keluarga model](repo-assets/free-tier.png)

<div align="center">

<table>
<tr>
<td align="center"><img src="repo-assets/providers/google.png" width="64" alt="Google Gemini"><br/><b>Google Gemini</b></td>
<td align="center"><img src="repo-assets/providers/groq.png" width="64" alt="Groq"><br/><b>Groq</b></td>
<td align="center"><img src="repo-assets/providers/mistral.png" width="64" alt="Mistral"><br/><b>Mistral</b></td>
<td align="center"><img src="repo-assets/providers/openrouter.png" width="64" alt="OpenRouter"><br/><b>OpenRouter</b></td>
<td align="center"><img src="repo-assets/providers/alibaba.png" width="64" alt="Alibaba Qwen"><br/><b>Alibaba Qwen</b></td>
<td align="center"><img src="repo-assets/providers/nous.png" width="64" alt="Nous Research"><br/><b>Nous Research</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/providers/siliconflow.png" width="64" alt="SiliconFlow"><br/><b>SiliconFlow</b></td>
<td align="center"><img src="repo-assets/providers/modelscope.png" width="64" alt="ModelScope"><br/><b>ModelScope</b></td>
<td align="center"><img src="repo-assets/providers/cloudflare.png" width="64" alt="Cloudflare"><br/><b>Cloudflare</b></td>
<td align="center"><img src="repo-assets/providers/cohere.png" width="64" alt="Cohere"><br/><b>Cohere</b></td>
<td align="center"><img src="repo-assets/providers/zhipu.png" width="64" alt="Zhipu GLM"><br/><b>Zhipu GLM</b></td>
<td align="center"><img src="repo-assets/providers/nvidia.png" width="64" alt="NVIDIA NIM"><br/><b>NVIDIA NIM</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/providers/baidu.png" width="64" alt="Baidu Qianfan"><br/><b>Baidu Qianfan</b></td>
<td align="center"><img src="repo-assets/providers/bytedance.png" width="64" alt="ByteDance Ark"><br/><b>ByteDance Ark</b></td>
<td align="center"><img src="repo-assets/providers/iflytek.png" width="64" alt="iFlytek Spark"><br/><b>iFlytek Spark</b></td>
<td align="center"><img src="repo-assets/providers/amd.png" width="64" alt="AMD Radeon"><br/><b>AMD Radeon</b></td>
<td align="center"><img src="repo-assets/providers/huggingface.png" width="64" alt="HuggingFace"><br/><b>HuggingFace</b></td>
<td align="center"><img src="repo-assets/providers/kilo.png" width="64" alt="Kilo"><br/><b>Kilo</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/providers/llm7.png" width="64" alt="LLM7"><br/><b>LLM7</b></td>
<td align="center"><img src="repo-assets/providers/ollama.png" width="64" alt="Ollama"><br/><b>Ollama</b></td>
<td align="center"><img src="repo-assets/providers/ovh.png" width="64" alt="OVH"><br/><b>OVH</b></td>
<td align="center"><img src="repo-assets/providers/pollinations.png" width="64" alt="Pollinations"><br/><b>Pollinations</b></td>
<td align="center"><img src="repo-assets/providers/opencode.png" width="64" alt="OpenCode"><br/><b>OpenCode</b></td>
<td align="center"><img src="repo-assets/providers/aihorde.png" width="64" alt="AI Horde"><br/><b>AI Horde</b></td>
</tr>
</table>

</div>

### 1. ⚡ 100% Free / Keyless (Tanpa Daftar & Tanpa Kartu Kredit)
| Provider | Model Gratis Tersedia | Catatan |
| :--- | :--- | :--- |
| **Kilo Gateway** | Kilo Auto Free, Nemotron-3 Ultra Free | Anonim tanpa registrasi, kuota free $0 |
| **OpenCode Free** | OpenCode Tier Models | Pool inferensi gratis bawaan |
| **OVH AI Endpoints** | Qwen3Guard, Stable Diffusion, Whisper TTS | 2 RPM anonim keyless |
| **LLM7** | Codestral, Mistral-Nemo, Gemma 4, GPT-OSS | Jatah harian gratis |
| **AI Horde** | Komunitas LLaMA, Qwen, Gemma, Mistral | Jaringan inferensi terdistribusi berbasis komunitas |

### 2. 🌐 Free Tier Kuota Besar dengan API Key
- **Google AI Studio:** Gemini 2.5 Flash / Pro (Jatah harian gratis yang sangat melimpah)
- **Groq:** Llama 3.3 70B & Mixtral super cepat (Batas 30 RPM pada free tier)
- **Pollinations:** Teks + gambar gratis (tanpa kunci)
- **Mistral AI:** Codestral (model koding unggulan), Mistral Small, Embeddings
- **Cloudflare Workers AI:** 10.000 neuron/hari gratis
- **Cohere:** Kredit uji coba Command R / Command R+
- **Zhipu AI (Z.ai):** Seri GLM-4 dan model visi
- **NVIDIA NIM:** 1.000 panggilan API percobaan gratis untuk model frontier open source

### 3. 🌏 Provider Regional & Kuota Harian Ekstra
- **ModelScope (Aliyun Cloud):** Qwen3.8, DeepSeek V4 Pro, GLM-5.2 (2.000 req/hari gratis)
- **Baidu Qianfan & Volcengine Ark:** DeepSeek & Doubao free tiers
- **NaraRouter:** Rute model AI latensi rendah untuk Indonesia & Asia Tenggara
- **Sea-Lion:** Model bahasa multibahasa khusus Asia Tenggara

### 4. 🔌 Provider Lokal & Gateway Khusus
Hubungkan model lokal Anda yang berjalan di **Ollama**, **LM Studio**, **vLLM**, atau **llama.cpp** secara langsung melalui tab Keys di dashboard.

---

## 🌐 Endpoint API Universal

Seluruh layanan gateway disatukan di bawah satu API key tunggal (`Bearer sr-xxx` atau header `x-api-key: sr-xxx`), dapat diakses kapan saja melalui tab **Keys** pada dashboard.

| Method | Endpoint | Permukaan Utama | Deskripsi | Header Autentikasi |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/v1/chat/completions` | **Chat Completions** | Kompatibel penuh dengan protokol OpenAI. Mendukung streaming (`stream: true`), function/tool calling, vision, structured outputs, dan auto-fallback routing. | `Bearer sr-xxx` |
| `POST` | `/v1/completions` | **Legacy Completions** | Endpoint OpenAI legacy completion (`object: "text_completion"`). Ideal untuk ghost-text code completion pada editor kode. | `Bearer sr-xxx` |
| `POST` | `/v1/responses` | **OpenAI Responses** | Format protokol native OpenAI Responses yang digunakan oleh OpenAI Codex CLI (`wire_api="responses"`). | `Bearer sr-xxx` |
| `POST` | `/v1/messages` | **Anthropic Messages** | Format native Anthropic Messages untuk Claude Code, Cursor (mode Anthropic), dan SDK resmi Anthropic. Mendukung `/v1/messages/count_tokens`. | `Bearer sr-xxx` atau `x-api-key: sr-xxx` |
| `POST` | `/v1/search` | **Web Search** | Layanan pencarian web terpadu dengan rotasi otomatis antara Parallel Search (keyless gratis) atau provider pencarian terkonfigurasi (Tavily, Exa, Firecrawl, Linkup). | `Bearer sr-xxx` |
| `GET` | `/v1/search/engines` | **Web Search** | Menampilkan daftar mesin pencari yang aktif, status kuota, dan ketersediaannya. | `Bearer sr-xxx` |
| `POST` | `/v1/decision` | **Decision (System One)** | Klasifikasi keputusan latensi sangat rendah (standar TypeSafe) yang mengevaluasi `state` dan pertanyaan kriteria `choice`. Resolusi 3-tier: remote Jev host → fallback chat-judge → fail-open heuristik lokal. | `Bearer sr-xxx` |
| `POST` | `/v1/decisions` | **Decisions** | Model klasifikasi rubrik multikelas (Cloudflare Clef Flash, OpenRouter Mercury Decide). | `Bearer sr-xxx` |
| `GET` | `/v1/decisions/models` | **Decisions** | Menampilkan model penskoran keputusan yang tersedia di katalog. | `Bearer sr-xxx` |
| `POST` | `/v1/fetch` | **Page Fetch** | Mengambil konten halaman web publik yang bersih dan mudah dibaca (boilerplate HTML dipangkas). Fallback otomatis melalui TinyFish Fetch dan Jina Reader (keyless). | `Bearer sr-xxx` |
| `GET` | `/v1/fetch/sources` | **Page Fetch** | Menampilkan daftar reader pembaca halaman (`tinyfish-fetch`, `jina-reader`) beserta status aktivasinya. | `Bearer sr-xxx` |
| `GET` | `/v1/models` | **Model Discovery** | Katalog kompatibel OpenAI yang memuat seluruh model aktif, alias fallback (`auto`, `auto:fast`, `auto:smart`, `auto:cheap`), dan negosiasi format Anthropic. | `Bearer sr-xxx` |
| `POST` | `/v1/embeddings` | **Embeddings** | Menghasilkan vektor embedding teks melalui provider yang terhubung. | `Bearer sr-xxx` |
| `POST` | `/v1/images/generations` | **Image Media** | Pembuatan gambar multimodal yang diarahkan melalui katalog media. | `Bearer sr-xxx` |
| `POST` | `/v1/audio/speech` | **Audio Media** | Sintesis suara teks-ke-ucapan (TTS). | `Bearer sr-xxx` |
| `POST` | `/v1beta/models/*:generateContent` | **Gemini Native** | Format native Google Gemini untuk Gemini CLI dan SDK resmi Google. | `Bearer sr-xxx` atau `x-goog-api-key` |
| `POST` | `/mcp` | **Server MCP** | Server Model Context Protocol berbasis Streamable HTTP (stateless JSON-RPC). | `Bearer sr-xxx` |
| `GET` | `/v1/docs` | **Referensi API** | Antarmuka interaktif referensi API mandiri tanpa dependensi eksternal. | *Publik (Tanpa Auth)* |
| `GET` | `/v1/openapi.json` | **Spesifikasi OpenAPI** | Spesifikasi OpenAPI 3.0 lengkap untuk keperluan integrasi dan generator kode. | *Publik (Tanpa Auth)* |

> [!TIP]
> - **Decision System One (`POST /v1/decision`):** Ketahanan 3-tier: evaluasi remote Jev super cepat (< 2000ms) → penilaian ringan chat-judge (via `decision_chat_judge_order`) → fail-open heuristik lokal instan (`scoreChoice`), menjamin nol downtime bagi agent.
> - **Web Tools vs Providers (`Keys` $\to$ `Web Tools`):** Kunci API untuk pencarian dan ekstraksi web (Tavily, Exa, Firecrawl, TinyFish) dikelola terpisah dari provider model LLM. Mesin tanpa kunci (**Parallel Search**, **Jina Reader**) langsung aktif tanpa konfigurasi tambahan.

---

## 🛠️ Setup MCP Server & Transport

SRouter menyertakan server bawaan **Model Context Protocol (MCP)** melalui protokol **Streamable HTTP** (`POST http://localhost:20268/mcp`), sesuai revisi protokol `2025-06-18`.

Coding assistant seperti Claude Desktop, Cursor, Cline, dan Roo Code dapat memeriksa ketersediaan model aktif, memantau jatah kuota, melihat statistik kompresi token, dan mengubah strategi perutean secara dinamis.

### Contoh Konfigurasi

#### 1. Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "srouter": {
      "url": "http://localhost:20268/mcp",
      "headers": {
        "Authorization": "Bearer sr-kunci-unified-anda"
      }
    }
  }
}
```

#### 2. Cursor / Cline / Windsurf MCP
Tambahkan server MCP berbasis HTTP di pengaturan editor Anda:
- **Server Name:** `srouter`
- **Server URL:** `http://localhost:20268/mcp`
- **HTTP Headers:** `Authorization: Bearer sr-kunci-unified-anda`

**Alat (Tools) MCP Bawaan:** `list_models`, `check_health`, `get_routing_scores`, `set_routing_strategy`, `get_cache_stats`, `clear_cache`, `get_compression_stats`, `get_quota_outlook`, `ask_srouter`.

---

## 🛡️ Standar Keandalan & Toleransi Gangguan (Reliability Defaults)

- **Circuit Breaker Nonaktif Secara Default (`0`):** Dirancang untuk fallback multi-provider yang agresif. Kendala kuota 429 atau timeout hanya mendinginkan key/model yang bersangkutan dan langsung mengalihkan rute ke provider cadangan, alih-alih memutus seluruh sistem gateway.
- **SSE Keepalive:** Jalur streaming (OpenAI, Anthropic, Responses) secara berkala mengirimkan komentar denyut jantung (`: keepalive\n\n`) untuk mencegah pemutusan koneksi sepihak oleh reverse proxy (Nginx, Cloudflare) atau firewall NAT saat model sedang berpikir panjang.
- **Anggaran Waktu yang Koheren (Coherent Time Budgets):** Batas waktu timeout diselaraskan per lompatan (*hop*) fallback dengan durasi total streaming untuk mencegah pembatalan koneksi prematur.

---

## 🏗️ Arsitektur Proyek

SRouter dirancang dengan arsitektur monorepo modular yang bersih:

```
srouter/
├── cli/                 ← Paket CLI & generator konfigurasi otomatis (`srouter setup-*`)
├── client/              ← Web Dashboard (React + Vite + Tailwind + Lucide, 60 bahasa)
├── desktop/             ← Aplikasi Desktop Electron (system tray popover macOS & Windows)
├── docker/              ← Berkas Dockerfile & konfigurasi runtime container
├── docs/                ← Dokumentasi lengkap multi-bahasa & referensi API
│   ├── en/              ← Panduan & arsitektur dalam Bahasa Inggris
│   ├── zh-cn/           ← Dokumentasi dalam Bahasa Mandarin
│   └── README.md        ← Indeks navigasi dokumentasi
├── repo-assets/         ← Aset visual brand, diagram arsitektur, dan tangkapan layar UI
├── scripts/             ← Skrip otomatisasi bootstrap, pengujian dev, dan rilis
├── server/              ← Inti Gateway (Node.js + TypeScript + SQLite)
│   ├── src/
│   │   ├── db/          ← Database SQLite, migrasi skema, dan seeding katalog model
│   │   ├── providers/   ← 60+ adapter provider & normalisasi protokol wire
│   │   ├── routes/      ← Rute API OpenAI, Anthropic, Gemini, Ollama & panel admin
│   │   ├── services/    ← Scoring bandit, pelacak kuota, brankas kripto, token saver
│   │   └── index.ts     ← Titik masuk (entry point) utama server gateway
├── shared/              ← Tipe data TypeScript, skema, dan definisi katalog terbagi
├── CONTRIBUTING.md      ← Panduan kontribusi, standar pengujian & aturan PR
├── LICENSE              ← Lisensi sumber terbuka MIT
└── package.json         ← Konfigurasi workspace monorepo
```

---

## ✨ Fitur Unggulan

![Ringkasan fitur SRouter — routing pintar, failover otomatis, fusion, analitik, multi-protocol](repo-assets/features.png)

- **Translasi Berbagai Format Protokol:**
  - Mendukung seluruh endpoint OpenAI (`/v1/chat/completions`, `/v1/models`, `/v1/embeddings`, `/v1/images/generations`, `/v1/audio/*`).
  - Mendukung penuh Anthropic Messages API (`/v1/messages`) untuk menjalankan Claude Code secara native.
  - Mendukung Google Gemini API (`/v1beta/models/*:generateContent`).
  - Emulasi Ollama untuk editor seperti Zed dan JetBrains AI.
  - Mendukung endpoint `/v1/responses` untuk Codex CLI.
- **Kompresi Prompt & Penghemat Token (Prompt Compression):**
  - Pemfilteran heuristik berbasis struktur dan regex untuk merapikan output tools yang bising (`git diff`, pembacaan file, log terminal).
  - Merapikan struktur JSON berulang dan memangkas konteks usang, **umumnya menghemat 20–40% token**.
- **Enam Strategi Routing Pintar:**
  - `auto`: Menyeimbangkan kecepatan, kecerdasan model, dan sisa kuota.
  - `auto:fast`: Memprioritaskan provider berlatensi super rendah (Groq).
  - `auto:smart`: Mengarahkan ke model dengan kemampuan penalaran tertinggi (Gemini 2.5 Pro, Codestral).
  - `auto:cheap`: Menghemat kuota premium dengan memanfaatkan endpoint gratis ringan.
  - `auto:<profile>`: Rantai fallback khusus yang dikonfigurasi melalui dashboard.
- **Sintesis Multi-Model (Fusion):**
  - Panggil model virtual `fusion`: prompt dikirim ke beberapa model gratis secara paralel; model juri akan menggabungkan jawaban menjadi satu respons terbaik.
- **Complexity Gate (System One):**
  - Penganalisis heuristik pra-routing mengklasifikasikan kompleksitas prompt: pertanyaan sederhana masuk jalur cepat, instruksi koding multi-langkah dialihkan ke model penalaran mendalam.
- **Server MCP Bawaan (`/mcp`):**
  - Menghubungkan SRouter langsung ke ChatGPT, Claude Desktop, atau agent berbasis Model Context Protocol (MCP) untuk inspeksi kesehatan model dan pemilihan strategi.
- **Keamanan Lokal 100%:**
  - Kredensial API key tersimpan terenkripsi dengan **AES-256-GCM** di SQLite lokal.
  - AI Agent Anda hanya memegang satu token bearer terpadu `srouter-...`.
- **Mendukung 60 Bahasa:**
  - Antarmuka dashboard otomatis mendeteksi bahasa sistem pengguna, lengkap dengan tata letak teks kanan-ke-kiri (RTL) untuk bahasa Arab, Ibrani, dan Persia.

---

## 🛠️ Daftar Perintah Penting (Command Reference)

| Perintah | Deskripsi |
| :--- | :--- |
| `npm run dev` | Menjalankan server gateway (:20268) & web UI (:5173) dengan hot reload |
| `npm run dev:lan` | Menjalankan server pengembangan yang dapat diakses di jaringan lokal (LAN) |
| `npm run build` | Melakukan build produksi untuk server, CLI, dan client |
| `npm test` | Menjalankan seluruh test suite otomatis (unit test, bootstrap test, hooks) |
| `npm run lint` | Memeriksa error TypeScript dan kaidah penulisan kode |
| `npm run db:migration:up` | Menjalankan seluruh migrasi database SQLite yang tertunda |
| `npm run db:migration:down` | Mengembalikan (rollback) migrasi database terakhir |
| `npm run db:migration:create --name=<n>` | Membuat file migrasi database baru |
| `npm run desktop:dev` | Menjalankan aplikasi desktop dalam mode development |
| `npm run desktop:dist:win` | Membangun file installer Windows Desktop (`.exe`) |
| `npm run desktop:dist:mac:x64` | Membangun file installer macOS Intel (`.dmg`) |

---

## 🖼️ Tangkapan Layar Dashboard

<div align="center">

### Manajemen Model & Skor Keandalan Live
![Halaman Model](repo-assets/models.png)

### Brankas Kunci Terenkripsi & Status Kuota
![Halaman Kunci](repo-assets/keys.png)

### Playground Interaktif dengan Dukungan Multimodal
![Halaman Playground](repo-assets/playground.png)

### Analitik Latensi & Penggunaan Token Real-Time
![Halaman Analitik](repo-assets/analytics.png)

</div>

---

## ⚠️ Troubleshooting & Solusi Cepat

### 1. Port 20268 sudah digunakan aplikasi lain
Ubah port melalui berkas `.env` atau jalankan via argumen CLI:
```bash
srouter serve --port 20270
```

### 2. Provider mengembalikan error 429 Too Many Requests
SRouter secara otomatis mendinginkan (*cooldown*) key/provider tersebut dan mengarahkan permintaan ke model berikutnya dalam rantai fallback Anda. Anda juga dapat mengaktifkan provider gratis tanpa key (seperti Kilo atau OpenCode Free) sebagai jaring pengaman terakhir.

### 3. Lupa password akun Dashboard?
Klik tautan **"Forgot password?"** pada halaman login. Karena SRouter berprinsip lokal murni, kode reset 6-digit dicetak langsung di log konsol terminal server:
```bash
# Pengguna Docker:
docker compose logs -f srouter

# Pengguna CLI / Desktop:
# Periksa kode reset di log terminal atau buka ~/.srouter/logs/srouter.log
```

### 4. Di mana letak database dan file data tersimpan?
- **Global CLI / Source:** `~/.srouter/srouter.db`
- **Docker Container:** Volume Docker yang diarahkan ke `/app/server/data`
- **Windows Desktop:** `%APPDATA%\SRouter\srouter.db`
- **macOS Desktop:** `~/Library/Application Support/SRouter/srouter.db`

---

## 🤝 Panduan Kontribusi

Kami sangat menyambut kontribusi dari komunitas! Baik dalam bentuk penambahan provider baru, optimasi kompresi prompt, perbaikan bug, maupun terjemahan:

1. Pelajari **[Panduan Kontribusi (CONTRIBUTING.md)](CONTRIBUTING.md)**.
2. Patuhi **[Pedoman Komunitas (CODE_OF_CONDUCT.md)](CODE_OF_CONDUCT.md)**.
3. Tinjau **[Kebijakan Keamanan (SECURITY.md)](SECURITY.md)** jika menemukan celah keamanan.

---

## ❤️ Donasi & Dukungan Pengembang

Jika SRouter membantu produktivitas koding harian Anda, menghemat anggaran API, atau mempermudah riset AI Anda, Anda dapat mendukung pengembangan proyek ini melalui donasi:

[![Trakteer](https://img.shields.io/badge/Trakteer-e11d48?style=for-the-badge&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI%2BPHBhdGggZmlsbD0id2hpdGUiIGQ9Ik00IDRoMTZ2M2gtNi41djExaC0zVjdINFY0eiIvPjwvc3ZnPg%3D%3D&logoColor=white)](https://trakteer.id/baiibayu/tip)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/baiibayu)
[![PayPal](https://img.shields.io/badge/PayPal-0070BA?style=for-the-badge&logo=paypal&logoColor=white)](https://www.paypal.me/baiibayu)

---

## 📄 Lisensi & Pernyataan Resmi (Disclaimer)

- **Lisensi:** Proyek sumber terbuka di bawah naungan [MIT License](LICENSE).
- **Disclaimer:** SRouter dikembangkan untuk keperluan pengembangan software, eksperimen riset, dan produktivitas coding agent secara mandiri. Penggunaan free tier tunduk pada Terms of Service (ToS) dari masing-masing provider penyedia layanan AI. Untuk beban kerja produksi skala perusahaan, kami menyarankan tetap menggunakan tier enterprise berbayar resmi.

<div align="center">
<sub>Dikembangkan dengan dedikasi oleh <b><a href="https://github.com/baiibayu">@baiibayu</a></b> & kontributor komunitas sumber terbuka.</sub>
</div>
