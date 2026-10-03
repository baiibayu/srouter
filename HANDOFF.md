# HANDOFF — Koordinasi Multi-Agent

> Aturan main: baca file ini SEBELUM mulai kerja, UPDATE setelah selesai.
> Basis kolaborasi (sejak 2026-10-02): working copy utama SRouter.
> Koordinator: Hermes. Worker: OpenCode (di-dispatch via `opencode run`).

## Lokasi (pindah dari Orca firefish, 2026-10-02)

| Agent | Lokasi kerja | Branch | Catatan |
|-------|--------------|--------|---------|
| OpenCode | `C:\Users\Hype AMD\Downloads\APP\SRouter` (repo utama) | main | HEAD 454f8225; remote `upstream` = tashfeenahmed/freellmapi |
| Hermes | repo utama (jangan edit file yang sama saat OpenCode aktif); task paralel → worktree baru `git worktree add` | main / branch task | |

- Clone lama `C:\Users\Hype AMD\.freellmapi` (main a34cfc7c, 1 commit di belakang repo utama) = ARSIP — jangan dipakai untuk kerja baru.
- Worktree Orca `C:\Users\Hype AMD\orca\workspaces\.freellmapi\firefish` = STALE, sudah tidak dipakai.

## Status Log

- 2026-10-02 — Setup jalur koordinasi Hermes↔OpenCode (di firefish; sekarang retired).
- 2026-10-02 — Batch cherry-pick 16 commit upstream SELESAI di clone lama (afa0359d), semua suite hijau.
- 2026-10-02 — Task Northwest domain: signup error, dihentikan (ToS: gratis bersyarat + 60-day lock + exit fee). Riset alternatif: Porkbun, Cloudflare Registrar (at-cost), atau registrar lokal (QRIS/transfer). Detail: vault `Percobaan Northwest Gagal - ToS verified.md`.
- 2026-10-02 — Kolaborasi pindah ke `Downloads\APP\SRouter`. HANDOFF.md lama di firefish diganti pointer; .freellmapi & firefish diarsipkan.
- 2026-10-02 — Task domain (OpenCode): srouter.org AVAILABLE di Northwest, registrasi $0 (fee waived), sudah di cart, halaman Create Account terbuka — menunggu user isi data akun (nama/email/password). ToS asli dibaca: renewal gratis bersyarat (akun aktif + tetap di Northwest), offer bisa diakhiri sepihak tanpa notice, harga .org $75/thn jika tidak eligible. Detail: vault `Registrasi srouter.org Northwest - checkpoint 2026-10-02.md` + `ToS Northwest Free Domain Offer - kutipan asli 2026-10-02.md`.

## Pekerjaan tersisa / kandidat task

- Upstream sync lanjutan: repo utama behind 26 commit vs `upstream` (tashfeenahmed/freellmapi). Workflow cherry-pick per vault `fork-strategy.md`; skip duplikat/chore(release)/merge; build+test per batch.
- Domain srouter.org: PERCOBAAN ULANG berjalan — cart $0 siap di Northwest, tinggal user isi Create Account; monitor renewal bulan ke-2/3; fallback eu.org / pp.ua / registrar lokal.
- GitHub push + npm claim `srouter`: menunggu username + gh auth dari user.

## Aturan Anti-Tabrakan

1. Satu worktree = satu agent. Jangan dua agent di worktree yang sama.
2. Sebelum dispatch task ke OpenCode, cek `git status` repo target — pastikan bersih atau catat apa yang sudah berubah.
3. Prompt ke OpenCode: tulis spesifik (file mana, hasil apa, cara verifikasi). Sertakan file konteks dengan `-f` bila perlu.
4. Setelah OpenCode selesai: koordinator verifikasi sendiri (git diff, build, test) — jangan percaya laporan tanpa cek.
5. Kutip ganda di prompt aman di bash, tapi hindari karakter aneh di path Windows.
