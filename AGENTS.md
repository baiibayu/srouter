# AGENTS.md — SRouter

## Proyek
SRouter (fork & rebrand FreeLLMAPI, MIT — kredit Tashfeen Ahmed). Monorepo: `server/` (Express+TS), `client/` (Vite+React), `shared/`, `cli/`, `desktop/`. Rencana rebrand: `C:\Users\Hype AMD\basic-memory\srouter\srouter-rebranding-plan.md`.

## Working copies (2026-10-02)
- **Working copy utama & basis kolaborasi multi-agent**: `C:\Users\Hype AMD\Downloads\APP\SRouter` (main, HEAD 454f8225; remote `upstream` = tashfeenahmed/freellmapi). Koordinasi Hermes↔OpenCode via `HANDOFF.md` di root repo ini.
- Main clone lama: `C:\Users\Hype AMD\.freellmapi` (main a34cfc7c, 1 commit di belakang repo utama) — ARSIP, jangan dipakai kerja baru.
- Worktree Orca: `C:\Users\Hype AMD\orca\workspaces\.freellmapi\firefish` (branch firefish, stale) — sudah tidak dipakai; HANDOFF.md lama diganti pointer.
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
- **Anti over-engineering**: jaga hemat RAM/ROM ala 9Router — dependency & kode seperlunya saja (hindari Omniroute-style fork berat yang jadi tidak relevan). **Library BARU boleh** kalau manfaatnya jelas (mempercepat, menstabilkan, atau membuka fitur yang mustahil/manual) — asal dipertimbangkan dampaknya (ukuran, RAM, maintenance); yang ditolak hanya yang berlebihan/redundan, jangan sampai proyek gagal berkembang karena terlalu kaku. Evalukasi konsumsi RAM server & ukuran dist tiap perubahan besar.
- Source update upstream: `git remote rename origin upstream` (workflow cherry-pick — lihat note fork-strategy.md).
## Versi (WAJIB — aturan bump)
- Versi unified **0.1.0** di semua package (cli, server, desktop, client, shared); root `@srouter/monorepo` private tanpa versi.
- **Patch 0.1.x**: bug fix kecil/perbaikan internal (typo, docs, test) — boleh skip bump.
- **Minor 0.2.0 dst**: fitur baru, perubahan perilaku, dependency penting, atau apa pun yang menyangkut pengguna.
- **Agent WAJIB setelah task selesai**: cek apakah perubahan menyangkut versi. Kalau YA → bump package.json (semua workspace) + sinkron SECURITY.md (baris "current") + `npm install` (lock) + commit. Kalau TIDAK → bilang eksplisit ke user: "versi tidak perlu diupdate karena ...".
- Jangan diam-diam: user sering lupa, agent harus mengingatkan.
- Saat up GitHub/npm: versi di package = versi release yang dipublikasikan.
## Data & key (RAHASIA — jangan pernah di-commit)
- `server/data/` (DB srouter.db + .encryption-key) dan `.env` sudah di-.gitignore — **jangan di-force-add, jangan masuk push GitHub**.
- DB berisi 42 API key terenkripsi + akun dashboard — di-restore 2026-10-02 dari freeapi.db (era lama) ke srouter.db; file lama `freeapi.db` masih ada sebagai arsip lokal.
- **Setelah install fresh dari repo user**: agent WAJIB injek data — copy `server/data/` (atau minimal srouter.db + .encryption-key) dari backup lokal (`C:\Users\Hype AMD\Downloads\APP\SRouter\server\data` atau `.freellmapi-arsip\server\data`) ke instalasi baru, lalu start server. Jangan generate key baru kalau backup ada.
- Kalau user minta demo tanpa key: biarkan kosong (server auto-generate key dev).