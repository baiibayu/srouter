<div align="center">

# 🖥️ SRouter Desktop

### Native System Tray & Menu-Bar Application for SRouter AI Gateway

**Run the complete SRouter gateway locally as a background native application with a sleek dark-glass tray popover, live request metrics, one-click API key copying, and instant dashboard access.**

[![Electron](https://img.shields.io/badge/Electron-38.x-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/baiibayu/srouter/blob/main/LICENSE)
[![Platforms](https://img.shields.io/badge/Platforms-Windows%20%7C%20macOS%20%7C%20Linux-blueviolet)](https://github.com/baiibayu/srouter/releases/latest)

<p align="center">
  <a href="#-quick-download"><b>📥 Downloads</b></a> •
  <a href="#-features"><b>✨ Features</b></a> •
  <a href="#-prerequisites"><b>📋 Prerequisites</b></a> •
  <a href="#-building-from-source"><b>🛠️ Building</b></a> •
  <a href="#-development-loop"><b>💻 Development</b></a> •
  <a href="#-storage--data-paths"><b>📂 Storage Paths</b></a>
</p>

<p align="center">
  <a href="https://github.com/baiibayu/srouter/releases/latest/download/SRouter-Setup-win.exe"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/badges/windows.svg" height="42" alt="Download for Windows"></a>
  <a href="https://github.com/baiibayu/srouter/releases/latest/download/SRouter-mac-arm64.dmg"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/badges/macos-arm64.svg" height="42" alt="Download for macOS (Apple Silicon)"></a>
  <a href="https://github.com/baiibayu/srouter/releases/latest/download/SRouter-mac-x64.dmg"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/badges/macos-x64.svg" height="42" alt="Download for macOS (Intel)"></a>
  <a href="https://github.com/baiibayu/srouter/releases/latest/download/SRouter.AppImage"><img src="https://raw.githubusercontent.com/baiibayu/srouter/main/repo-assets/badges/linux.svg" height="42" alt="Download for Linux"></a>
</p>

</div>

---

## 📥 Quick Download

Pre-compiled binary releases are available on the **[Releases Page](https://github.com/baiibayu/srouter/releases/latest)**:

- **Windows:** `SRouter-Setup-x.x.x.exe` (Installer)
- **macOS (Apple Silicon M-Series):** `SRouter-x.x.x-arm64.dmg` or `.zip` *(Requires macOS 12 Monterey or later)*
- **macOS (Intel):** `SRouter-x.x.x-x64.dmg` or `.zip`
- **Linux:** `SRouter-x.x.x.AppImage`

> [!NOTE]
> Locally built apps and release binaries run natively on loopback (`127.0.0.1:31415`). The desktop application signs into the local dashboard automatically with a local token — no account registration or password required.

---

## ✨ Features

- **System Tray Popover:** Click the tray icon to view 24-hour request volume charts, active provider statuses, and copy your gateway URL (`http://127.0.0.1:31415/v1`) or unified API key in one click.
- **Embedded Gateway Server:** Bundles the full Node.js + TypeScript gateway and SQLite database inside the native desktop lifecycle.
- **Zero Configuration Login:** Automatically handles session tokens for local dashboard administration without manual password prompts.
- **Automatic Port Conflict Resolution:** Binds to `127.0.0.1:31415` by default, automatically scanning up if the port is busy, and persisting the bound port across sessions.
- **Background Persistence:** Runs quietly in your system tray or menu bar without cluttering your dock or taskbar when closed.

---

## 📋 Prerequisites

To build the desktop application from source, ensure you have:

- **Node.js:** `>= 20.18.0`
- **Native C++ Build Toolchain** (required for `better-sqlite3` native compilation):
  - **Windows:** Visual Studio Build Tools ("Desktop development with C++")
  - **macOS:** Xcode Command Line Tools (`xcode-select --install`) and Python 3
  - **Linux:** `build-essential`, `python3`, and standard development libraries

---

## 🛠️ Building from Source

Build standalone installers from the **repository root**:

```bash
# 1. Install all dependencies across workspaces
npm install
npm install --prefix desktop

# 2. Build for your target platform:
npm run desktop:dist:win       # Windows → desktop/dist-electron/SRouter-Setup-win.exe
npm run desktop:dist          # macOS Apple Silicon → desktop/dist-electron/SRouter-…-arm64.dmg
npm run desktop:dist:mac:x64  # macOS Intel → desktop/dist-electron/SRouter-…-x64.dmg
npm run desktop:dist:linux    # Linux → desktop/dist-electron/SRouter-….AppImage
```

> [!TIP]
> Locally built desktop binaries do not carry quarantine attributes (macOS Gatekeeper or Windows Mark-of-the-Web), launching immediately without requiring code signing.

---

## 💻 Development Loop

To iterate on the desktop application locally with hot reload:

```bash
cd desktop

# 1. Rebuild better-sqlite3 against Electron's specific ABI
npm run rebuild:native

# 2. Bundle backend & preload scripts, then launch Electron
npm run dev
```

From the monorepo root, you can also run:
```bash
npm run desktop:dev
```
*(This automatically builds `client/dist` and boots the Electron harness).*

---

## 📂 Storage & Data Paths

The desktop app stores its encrypted SQLite database (`srouter.db`) and logs locally:

| OS | Configuration & Database Path |
| :--- | :--- |
| **Windows** | `%APPDATA%\SRouter\srouter.db` |
| **macOS** | `~/Library/Application Support/SRouter/srouter.db` |
| **Linux** | `~/.config/srouter/srouter.db` |

---

## 📄 License

Open-source under the [MIT License](https://github.com/baiibayu/srouter/blob/main/LICENSE).
Maintained by **[@baiibayu](https://github.com/baiibayu)** & community contributors.
