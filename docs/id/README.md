<div align="center">

# 🇮🇩 Dokumentasi Resmi SRouter

### Panduan Lengkap, Spesifikasi API, dan Referensi Arsitektur

[![Lisensi MIT](https://img.shields.io/badge/License-MIT-green.svg)](../../LICENSE)
[![Kompatibel OpenAI](https://img.shields.io/badge/API-OpenAI%20%7C%20Anthropic%20%7C%20Gemini-blue)](../en/api/01-rest-api.md)
[![Dukungan Agent](https://img.shields.io/badge/Agents-Claude%20%7C%20Cursor%20%7C%20Cline%20%7C%20Codex-purple)](../en/clients/01-agent-clients.md)

<p align="center">
  <b>Bahasa / Language:</b><br/>
  <a href="../en/README.md"><b>🇺🇸 English</b></a> •
  <a href="README.md"><b>🇮🇩 Bahasa Indonesia</b></a> •
  <a href="../zh-cn/README.md"><b>🇨🇳 简体中文</b></a>
</p>

</div>

---

## 📖 Gambaran Umum Dokumentasi

Selamat datang di pusat dokumentasi resmi **SRouter**. SRouter dirancang sebagai gateway dan perute (router) AI cerdas berbasis komputasi lokal yang menyatukan puluhan provider gratis (*free tier*) dan model lokal ke dalam satu endpoint universal yang kompatibel dengan protokol OpenAI, Anthropic Messages, Google Gemini, dan Ollama.

Dokumentasi ini disusun secara terstruktur untuk memandu Anda dari tahap instalasi awal hingga pemanfaatan tingkat lanjut:

---

## 🚀 1. Instalasi & Deployment

Pilih metode yang paling tepat untuk lingkungan kerja Anda:

### A. Global CLI / NPX (Instan)
Metode tercepat untuk komputer lokal tanpa perlu clone repositori git:
```bash
# Langsung jalankan via npx (tanpa install permanen)
npx @baiibayu/srouter

# Atau install global
npm install -g @baiibayu/srouter
srouter
```
Dashboard akan otomatis terbuka di browser pada `http://localhost:20268`.

### B. Docker Compose (Server & Home Lab)
Metode yang direkomendasikan untuk home server, VPS, atau Docker desktop:
```bash
git clone https://github.com/baiibayu/srouter.git
cd srouter
cp .env.example .env
docker compose up -d
```
- Dashboard web: `http://localhost:20268`
- Endpoint API: `http://localhost:20268/v1`

### C. Aplikasi Desktop (macOS & Windows)
Aplikasi desktop berbasis Electron yang berjalan di system tray / menu bar:
1. Buka halaman [Releases GitHub](https://github.com/baiibayu/srouter/releases/latest).
2. Unduh installer `.exe` untuk Windows atau `.dmg` untuk macOS.
3. Jalankan aplikasi; Unified API Key dan statistik request langsung muncul pada popover menu bar.

*Panduan lengkap instalasi: [docs/en/install/01-install.md](../en/install/01-install.md)*

---

## 🤖 2. Integrasi AI Coding Agents

SRouter menyertakan generator konfigurasi sekali klik (`setup-*`):

### Claude Code
```bash
# Konfigurasi otomatis Claude Code
npx srouter setup-claude --url http://localhost:20268 --api-key <unified-key-anda>

# Atau jalankan langsung tanpa menulis kunci ke file disk (Zero-Persistence Launcher)
npx srouter launch
```

### Cursor & Windsurf
1. Buka **Settings** $\to$ **Models** / **OpenAI API Key**.
2. Masukkan **Base URL:** `http://localhost:20268/v1`.
3. Masukkan **API Key:** Unified Key dari dashboard SRouter Anda (`srouter-...`).
4. Masukkan **Model:** `auto` (atau `auto:smart` / `auto:fast`).

### Cline & Roo Code (VS Code Extension)
```bash
npx srouter setup-cline
# Atau untuk Roo Code:
npx srouter setup-roo
```

### Codex CLI
```bash
npx srouter setup-codex
# Atau launcher instan:
npx srouter launch-codex
```

*Panduan lengkap agent: [docs/en/clients/01-agent-clients.md](../en/clients/01-agent-clients.md)*

---

## 📡 3. Spesifikasi API & Translasi Protokol

SRouter secara otomatis menerjemahkan request ke format asli yang dibutuhkan oleh masing-masing provider:

| Endpoint | Protokol | Kegunaan |
| :--- | :--- | :--- |
| `POST /v1/chat/completions` | OpenAI Wire | Standar chat completion untuk Cursor, Cline, SDK Python/Node. |
| `POST /v1/messages` | Anthropic Wire | Format native Anthropic yang digunakan oleh Claude Code. |
| `POST /v1beta/models/*` | Gemini Wire | Format native Gemini CLI (`generateContent`). |
| `POST /api/chat` & `/api/generate` | Ollama NDJSON | Emulasi Ollama untuk editor seperti Zed dan JetBrains AI. |
| `POST /v1/embeddings` | OpenAI Wire | Inferensi embedding teks. |
| `POST /v1/images/generations` | OpenAI Wire | Pembuatan gambar via model AI visual. |
| `POST /v1/web-search` | SRouter Wire | Fitur pencarian web untuk agent (DuckDuckGo, SearXNG, Tavily). |
| `POST /v1/fetch` | SRouter Wire | Ekstraksi konten halaman web publik menjadi teks bersih. |

*Panduan lengkap API: [docs/en/api/01-rest-api.md](../en/api/01-rest-api.md)*

---

## ✂️ 4. Kompresi Prompt & Token Saver

Coding agent sering kali membuang-buang token untuk membaca output terminal yang sangat panjang (seperti `git diff`, hasil unit test berulang, atau respon file sistem yang bising). 

**Mekanisme Kerja Pipeline Kompresi SRouter:**
1. **Pembersihan Log & Output Alat:** Menggunakan pemfilteran heuristik dan parsing AST untuk memangkas baris log bising tanpa menghilangkan inti error atau perubahan kode.
2. **Kompaksi Struktur JSON:** Menyusutkan payload JSON berulang dan menghapus spasi/formatting yang tidak diperlukan.
3. **Pemangkasan Konteks Usang (Stale Context):** Menghapus riwayat percakapan lama yang sudah diselesaikan sebelum prompt dikirim ke provider upstream.
4. **Hasil:** Menghemat **20–40% token per request**, menjaga batas konteks (*context window*) tetap lega.

*Panduan kompresi: [docs/en/compression/01-compression-pipeline.md](../en/compression/01-compression-pipeline.md)*

---

## 🔒 5. Arsitektur & Keamanan Data

- **Brankas Kunci Terenkripsi AES-256-GCM:**
  API key dari provider yang Anda masukkan dienkripsi menggunakan kunci enkripsi 256-bit di database SQLite lokal (`srouter.db`). Kunci hanya didekripsi di memori secara sementara saat request dikirim ke provider yang bersangkutan.
- **Trafik Langsung (Zero Third-Party Relays):**
  SRouter berjalan di komputer Anda sendiri. Trafik AI dikirim langsung dari IP komputer Anda ke server provider resmi (Google, Groq, Mistral, dll). Tidak ada pihak ketiga yang merekam prompt koding Anda.
- **Tracking Rate Limit Cerdas:**
  Melacak counter RPM (Request Per Minute), RPD (Request Per Day), dan TPM (Token Per Minute) untuk setiap pasangan `(platform, model, key)` dengan auto-reset mengikuti zona waktu UTC provider.
- **Pembaruan Katalog Bertanda Tangan (Ed25519 Signed Feed):**
  Katalog model diperbarui secara berkala menggunakan tanda tangan kriptografi Ed25519 sehingga pembaruan kuota dan model baru masuk otomatis dengan aman tanpa risiko eksekusi kode berbahaya.

*Detail arsitektur: [docs/en/architecture/00-high-level-index.md](../en/architecture/00-high-level-index.md)*

---

## ⚠️ 6. FAQ & Solusi Cepat

### Q: Port 20268 sudah terpakai oleh aplikasi lain?
A: Jalankan dengan port lain melalui flag CLI `srouter serve --port 20270` atau ubah `PORT=20270` di file `.env`.

### Q: Bagaimana jika saya lupa password akun Dashboard?
A: Klik **"Forgot password?"** di halaman login. Kode reset 6-digit dicetak langsung di konsol terminal server Anda (atau cek file log di `~/.srouter/logs/srouter.log`).

### Q: Apakah SRouter bisa digunakan di jaringan lokal (LAN)?
A: Ya, jalankan dengan perintah `npm run dev:lan` atau set `HOST=0.0.0.0` di file konfigurasi.

---

<div align="center">
<sub>Dikembangkan dengan bangga oleh <b>Bayu Indra Sugiharto (<a href="https://github.com/baiibayu">@baiibayu</a>)</b> untuk komunitas software engineering & open source.</sub>
</div>
