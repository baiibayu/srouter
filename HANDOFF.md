# HANDOFF — Koordinasi Multi-Agent

> Aturan main: baca file ini SEBELUM mulai kerja, UPDATE setelah selesai.
> Basis kolaborasi (sejak 2026-10-02): working copy utama SRouter.
> Koordinator: Hermes. Worker: OpenCode (di-dispatch via `opencode run`).

## Lokasi (pindah dari Orca firefish, 2026-10-02)

| Agent | Lokasi kerja | Branch | Catatan |
|-------|--------------|--------|---------|
| OpenCode | `C:\Users\Hype AMD\Downloads\APP\SRouter` (repo utama) | main | HEAD 27e9e7ed (**0.3.2**); remote `upstream` = tashfeenahmed/freellmapi |
| Hermes | repo utama (jangan edit file yang sama saat OpenCode aktif); task paralel → worktree baru `git worktree add` | main / branch task | |

- Clone lama `C:\Users\Hype AMD\.freellmapi` (main a34cfc7c, 1 commit di belakang repo utama) = ARSIP — jangan dipakai untuk kerja baru.
- Worktree Orca `C:\Users\Hype AMD\orca\workspaces\.freellmapi\firefish` = STALE, sudah tidak dipakai.

## Status Log

- 2026-10-04 (lanjutan) — OpenCode (lead, solo): **3 issue user diperbaiki & DI-COMMIT di 0.3.2** (`0b60ea2a` fix notif, `ddf681bb` key sr-, `c8887abc` test lint, `27e9e7ed` release) — (1) notif "Update available: v0.13.4" salah: `checkUpdateAvailable` tanpa default repo upstream (wajib `SROUTER_UPDATE_REPO`, kosong → purge baris basi), `routes/update.ts` repo dari env → semua endpoint disabled tanpa repo; (2) spam notif: emit idempoten (1 baris), `markNotificationsRead` skip baris update pending (badge tetap), settle saat versi terbaru (baris read + turun kronologis), `getNotifications` pin baris pending di atas, App.tsx markRead refetch; (3) key unified `freellmapi-` → **`sr-`**: migration `20261004_000001_unified_key_sr_prefix` (suffix sama, in-place), regenerate+baseline `sr-`, client file (`~/.srouter/opencode-key` + `~/.config/opencode/opencode.json`) SUDAH diupdate. Verifikasi: lint server 0, build 0.3.2 OK, client test+i18n 60/1184+build hijau, server full suite 304/306 (2 flaky load: `router-key-bandit`, `fallback-loop-hedge` — solo 11/11), area baru 72/72 + db/migrate 17/17, server restart **PID 16604** `/health` 200, DB pasca-start key `sr-` (51 char) + notif 45→16 (update_available basi habis). Proses temp/stray dibersihkan (translate-all.cjs ×2, tmp script). Detail: vault `Fix notif update & key sr - checkpoint 2026-10-04.md`.

- 2026-10-04 — OpenCode (lead) + worker Orca (droid/grok, antigravity/agy): **3 fix laporan sync model & token budget SELESAI** — (1) auto-discover ikut `getSyncIntervalHours()` (unset→12h, 0/off→mati), (2) UI edit-key dialog tampilkan cap/sisa/resetsAt +5 key i18n di 60 locale, (3) kill-switch urutan sebelum `currentScheduler` + in-flight guard `syncCatalog`. Juga: notifikasi i18n payload (`97793aef`, bell read sync + `isNewerVersion` semver + `SROUTER_UPDATE_REPO`). Semua di-merge ke main (31e93130, 0cbcfc37) + release **0.3.1** (ac808172). Verifikasi: client 368/368 + i18n 60 locale/1184 key; server test area yang diubah 66/66 + tsc hijau; server restart background, `/health` 200. Worker diakhiri setelah worker_done (terminal ditutup — catatan user: jangan terlalu agresif, selama masih dipakai biarkan hidup). Fix hook telemetry Gemini rusak: folder `googlecloudtools.datacloud_telemetry` dipindah ke `config\*.bak` (di luar `plugins\`). Kilo CLI tersedia (`C:\nodejs\kilo.ps1`) sebagai fallback kalau agy habis limit.
- 2026-10-03 — OpenCode (lead): upstream sync SELESAI — 1 commit tersisa (716948f2 Gizmo+BlockRun, pick 57fec9e2, fix rebrand import 09cbfc72); resolusi konflik desktop/package.json (versi tetap unified); desktop/package-lock sinkron 0.2.0 (75f000de). Key opencode.json dipindah ke `.opencode/srouter-key` (gitignored) — commit 4b8e7ef3 + PasswordInput auth UI. Release **0.3.0** (e4905afc). Suite: server 3680 lulus/1 flaky (fallback-loop-hedge, lulus saat solo re-run), client 367 lulus + i18n 60 locale. Server restart, health 200, 641 model.
- 2026-10-02 — Setup jalur koordinasi Hermes↔OpenCode (di firefish; sekarang retired).
- 2026-10-02 — Batch cherry-pick 16 commit upstream SELESAI di clone lama (afa0359d), semua suite hijau.
- 2026-10-02 — Task Northwest domain: signup error, dihentikan (ToS: gratis bersyarat + 60-day lock + exit fee). Riset alternatif: Porkbun, Cloudflare Registrar (at-cost), atau registrar lokal (QRIS/transfer). Detail: vault `Percobaan Northwest Gagal - ToS verified.md`.
- 2026-10-02 — Kolaborasi pindah ke `Downloads\APP\SRouter`. HANDOFF.md lama di firefish diganti pointer; .freellmapi & firefish diarsipkan.
- 2026-10-02 — Task domain (OpenCode): srouter.org AVAILABLE di Northwest, registrasi $0 (fee waived), sudah di cart, halaman Create Account terbuka — menunggu user isi data akun (nama/email/password). ToS asli dibaca: renewal gratis bersyarat (akun aktif + tetap di Northwest), offer bisa diakhiri sepihak tanpa notice, harga .org $75/thn jika tidak eligible. Detail: vault `Registrasi srouter.org Northwest - checkpoint 2026-10-02.md` + `ToS Northwest Free Domain Offer - kutipan asli 2026-10-02.md`.

## Pekerjaan tersisa / kandidat task

- ~~Upstream sync~~ SELESAI 2026-10-03 — main sudah setara upstream/main (0 behind). Ulangi `git fetch upstream` + `git cherry-pick` untuk batch berikutnya.
- Sisa rebrand kecil (butuh keputusan user): `desktop/package.json` homepage = freellmapi.co; `cli/package.json` repository/bugs URL = tashfeenahmed/freellmapi; SECURITY.md link Security tab = repo upstream. Menunggu GitHub repo sendiri dibuat.
- Domain srouter.org: PERCOBAAN ULANG berjalan — cart $0 siap di Northwest, tinggal user isi Create Account; monitor renewal bulan ke-2/3; fallback eu.org / pp.ua / registrar lokal.
- GitHub push + npm claim `srouter`: menunggu username + gh auth dari user. Setelah ada: bump ref URL di package.json/SECURITY.md sekalian.
- Catatan: test server `fallback-loop-hedge.test.ts` bisa flaky kalau suite jalan beban penuh — re-run solo untuk konfirmasi. Juga flaky saat beban CPU/jaringan tinggi: `keys.test.ts` (#438/#1327 — auto-discover memanggil endpoint agnes nyata), `builtin-model-discovery`, `proxy*` (timeout 5s) — bukan regresi; verifikasi solo saat mesin idle.

## Aturan Anti-Tabrakan

1. Satu worktree = satu agent. Jangan dua agent di worktree yang sama.
2. Sebelum dispatch task ke OpenCode, cek `git status` repo target — pastikan bersih atau catat apa yang sudah berubah.
3. Prompt ke OpenCode: tulis spesifik (file mana, hasil apa, cara verifikasi). Sertakan file konteks dengan `-f` bila perlu.
4. Setelah OpenCode selesai: koordinator verifikasi sendiri (git diff, build, test) — jangan percaya laporan tanpa cek.
5. Kutip ganda di prompt aman di bash, tapi hindari karakter aneh di path Windows.
