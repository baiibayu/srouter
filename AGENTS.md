# AGENTS.md — SRouter

## Proyek
SRouter (fork & rebrand FreeLLMAPI, MIT — kredit Tashfeen Ahmed). Monorepo: `server/` (Express+TS), `client/` (Vite+React), `shared/`, `cli/`, `desktop/`. Rencana rebrand: `C:\Users\Hype AMD\basic-memory\srouter\srouter-rebranding-plan.md`.

## Working copies (2026-10-02)
- **Working copy utama**: `C:\Users\Hype AMD\Downloads\APP\SRouter` (clone dari main, HEAD a34cfc7c)
- Main clone (origin lokal): `C:\Users\Hype AMD\.freellmapi` (branch main)
- Worktree Orca: `C:\Users\Hype AMD\orca\workspaces\.freellmapi\firefish` (branch firefish, stale)
- Repo GitHub: BELUM ADA — saat jadi: `git remote add origin https://github.com/<user>/srouter.git && git push -u origin main`

## Status singkat
- Port default: **20268** (commit 4769938b); `.env.example` PORT=20268
- Premium/license: dihapus by design — jangan dipulihkan
- Domain: srouter.org via Northwest **GAGAL** (signup error); alternatif eu.org/pp.ua; `api.freellmapi.co` tetap untuk katalog
- npm package `srouter` belum diklaim

## Memory (WAJIB — baca & tulis)
- Vault: `C:\Users\Hype AMD\basic-memory` (di LUAR repo — jangan ikut di-commit)
- **Awal sesi**: baca `C:\Users\Hype AMD\basic-memory\MEMORY.md` (indeks) lalu note relevan di `basic-memory\srouter\`.
- **Checkpoint & akhir sesi**: tulis catatan ke vault (apa selesai, keputusan, sisa/blocked) + update indeks MEMORY.md. Pakai file `.md` langsung di vault (CLI write-note sering gagal parse argumen panjang).
- Jangan menulis memory ke lokasi Copilot Chat lama.

## Fakta dev kritis
- Server: `npm run build` di `server/` = tsc; jalan `node server/dist/index.js` port **20268**. Setelah build WAJIB restart proses node.
- Client: build = `tsc -b && vite build`; dist diserve dari disk oleh server.
- Client fetch: `apiFetch` dari `@/lib/api`.
- i18n: `client/src/i18n/locales/en.json` + `id.json`.
- UI: Base UI (@base-ui/react) — PopoverTrigger tidak punya `asChild`.
- DB: SQLite `server/data/*.db` (better-sqlite3).

## Batasan
- Jangan aktifkan/pulihkan kode premium/license.
- Source update upstream: `git remote rename origin upstream` (workflow cherry-pick — lihat note fork-strategy.md).
## Versi (WAJIB — aturan bump)
- Versi unified **0.1.0** di semua package (cli, server, desktop, client, shared); root `@srouter/monorepo` private tanpa versi.
- **Patch 0.1.x**: bug fix kecil/perbaikan internal (typo, docs, test) — boleh skip bump.
- **Minor 0.2.0 dst**: fitur baru, perubahan perilaku, dependency penting, atau apa pun yang menyangkut pengguna.
- **Agent WAJIB setelah task selesai**: cek apakah perubahan menyangkut versi. Kalau YA → bump package.json (semua workspace) + sinkron SECURITY.md (baris "current") + `npm install` (lock) + commit. Kalau TIDAK → bilang eksplisit ke user: "versi tidak perlu diupdate karena ...".
- Jangan diam-diam: user sering lupa, agent harus mengingatkan.
- Saat up GitHub/npm: versi di package = versi release yang dipublikasikan.