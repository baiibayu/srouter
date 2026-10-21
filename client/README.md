<div align="center">

# 🌐 SRouter Web Dashboard

### The Modern Frontend UI for SRouter AI Gateway

**Manage model fallback chains, inspect encrypted key vaults, monitor real-time latency & token savings, and test models in an interactive multimodal playground.**

[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8.0-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.2-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![i18n](https://img.shields.io/badge/i18n-60%20Languages-orange)](src/i18n/locale-config.ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/baiibayu/srouter/blob/main/LICENSE)

<p align="center">
  <a href="#-features"><b>✨ Features</b></a> •
  <a href="#-tech-stack"><b>🛠️ Tech Stack</b></a> •
  <a href="#-project-structure"><b>📂 Project Structure</b></a> •
  <a href="#-development--building"><b>🚀 Development</b></a> •
  <a href="#-internationalization-i18n"><b>🌍 i18n</b></a> •
  <a href="#-license"><b>📄 License</b></a>
</p>

![SRouter Dashboard Preview](https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/github-hero.png)

</div>

---

## ✨ Features

- **Models & Fallback Chains:** Visual drag-and-drop (`@dnd-kit`) model ordering for custom fallback sequences, intelligence scoring, and active execution status filters.
- **Key Vault & Web Tools:** Manage encrypted provider API keys (AES-256-GCM), web search tools (Tavily, Exa, Firecrawl, Linkup), page extractors (TinyFish, Jina), and generate scoped client profile keys (`sk-cp-...`).
- **Interactive Playground:** Multimodal playground with streaming responses, temperature/top-p controls, image inputs, system prompt overrides, and side-by-side model comparisons.
- **Real-Time Analytics:** Interactive latency curves, token consumption charts, requests per day, and provider error tracking powered by Recharts.
- **Server Logs Viewer:** Filter and inspect incoming requests, latency breakdowns, routed providers, token counts, and error causes in real time.
- **60 Languages & RTL Support:** Automatic browser locale detection with comprehensive RTL support (Arabic, Persian, Hebrew, Urdu).
- **Responsive & Dark-Themed:** Built with modern CSS variables, fluid glassmorphism accents, Geist typography, and adaptive layouts for desktop, tablet, and mobile.

---

## 🛠️ Tech Stack

| Technology | Purpose |
| :--- | :--- |
| **[React 19](https://react.dev)** | Modern component architecture, actions, and server-state synchronization |
| **[Vite 8](https://vitejs.dev)** | Blazing-fast development server with Hot Module Replacement (HMR) and optimized build bundling |
| **[Tailwind CSS v4](https://tailwindcss.com)** | Utility-first responsive styling and fluid animations |
| **[TanStack Query v5](https://tanstack.com/query)** | Asynchronous server-state management, cache invalidation, and polling |
| **[Recharts](https://recharts.org)** | Responsive SVG visualization for token throughput and latency metrics |
| **[@dnd-kit](https://dndkit.com)** | Accessible, high-performance drag-and-drop for model fallback chain ranking |
| **[Lucide React](https://lucide.dev)** | Crisp, modern iconography across all dashboard views |
| **[Geist Variable Fonts](https://vercel.com/font)** | Clean monospace and sans-serif typography |

---

## 📂 Project Structure

```
client/
├── public/                 ← Static public assets, favicons, and manifest
├── src/
│   ├── assets/             ← Local logos and brand graphics
│   ├── components/         ← Reusable UI component library (Button, Modal, Card, Table)
│   ├── contexts/           ← React contexts (Auth, Theme, Navigation)
│   ├── hooks/              ← Custom React hooks for API queries, mutation, and window size
│   ├── i18n/               ← Translation dictionaries (60 languages) & locale resolver
│   │   ├── locales/        ← JSON language catalogs (en, id, zh-CN, ja, etc.)
│   │   └── locale-config.ts
│   ├── pages/              ← Dashboard page views
│   │   ├── Analytics.tsx   ← Latency, token budget, and RPM/RPD charts
│   │   ├── Keys.tsx        ← Provider key vault, web search, & client profiles
│   │   ├── Logs.tsx        ← Live server request and error log viewer
│   │   ├── Models.tsx      ← Fallback chains & catalog explorer
│   │   ├── Playground.tsx  ← Multimodal test environment
│   │   └── Settings.tsx    ← Gateway preferences and backup tools
│   ├── services/           ← REST API client wrappers for SRouter gateway endpoints
│   ├── types/              ← TypeScript interface definitions for models, keys, and metrics
│   ├── App.tsx             ← Root application router and layout wrapper
│   └── main.tsx            ← Vite client entry point
├── package.json            ← Client dependencies & npm scripts
└── vite.config.ts          ← Vite build, alias, and dev proxy configuration
```

---

## 🚀 Development & Building

### Running in Development

The client development server communicates with the backend gateway server running on port `20268`:

```bash
# Start Vite development server on http://localhost:5173
npm run dev -w client

# Or start monorepo concurrently (Server :20268 + Client :5173 with HMR)
npm run dev
```

### Production Build

Compiles TypeScript and outputs the production bundle to `client/dist/`, which is automatically served by the SRouter backend server or desktop app:

```bash
npm run build -w client
```

### Testing & Linting

```bash
# Run client unit tests
npm test -w client

# Check translation completeness across all 60 locales
npm run check:i18n -w client

# Run ESLint validation
npm run lint -w client
```

---

## 🌍 Internationalization (i18n)

SRouter provides built-in translations for **60 languages**. To add or improve translations:
1. Locate the locale JSON in `client/src/i18n/locales/<locale-code>.json`.
2. Run `npm run check:i18n -w client` to identify missing translation keys against the English source (`en.json`).
3. For RTL languages (Arabic, Hebrew, Persian, Urdu), the layout automatically sets `dir="rtl"` on root containers.

---

## 📄 License

Open-source under the [MIT License](https://github.com/baiibayu/srouter/blob/main/LICENSE).
Crafted by **[@baiibayu](https://github.com/baiibayu)** & community contributors.
