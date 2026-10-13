# Premium Bypass — Embeddings, Media, & Quirks Auto-Discovery

## Apa yang Berubah?

File utama: `src/services/auto-discover.ts`

### Sebelum (lama)
Auto-discover **hanya** mendaftarkan **chat models** dari provider `/v1/models`.
Model embedding, image, audio, video, dan transcription **diabaikan** (difilter oleh `CHAT_EXCLUDE_KINDS`).

### Sesudah (baru)
Auto-discover sekarang mendaftarkan **SEMUA tipe model** sekaligus:

| Tipe | Target Table | Keterangan |
|------|-------------|------------|
| Chat models | `models` | Sama seperti sebelumnya |
| Embedding models | `embedding_models` | **BARU** — dimensions auto-guess dari nama model |
| Media models | `media_models` | **BARU** — image, audio, video, transcription |
| Provider Quirks | `quirks` + `quirk_targets` | **BARU** — auto-assign dari pattern provider |

---

## Cara Kerja

### 1. Model Classification (Pisah by Kind)
Setelah fetch `/v1/models`, semua model difilter free-tier seperti biasa, lalu **dipisah** berdasarkan `kind`:
- `kind === undefined` → Chat model
- `kind === 'embedding'` → Embedding model  
- `kind === 'image'` / `'audio'` / `'video'` / `'transcription'` → Media model

### 2. Embedding Dimension Detection
Untuk embedding models, dimensions ditentukan dari:
1. **Raw API response** — field `dimensions`/`dim`/`embedding_dim` dari response provider
2. **Heuristic dari nama model** — misal `nomic` → 768, `bge-large` → 1024, `text-embedding-3-small` → 1536

### 3. Quirk Auto-Assignment
Quirks ditambahkan otomatis berdasarkan pattern yang terdeteksi:

| Quirk | Kondisi | Severity |
|-------|---------|----------|
| `auto-no-pricing--{platform}` | >3 models, semua tanpa pricing info | info |
| `auto-short-context--{platform}` | >50% chat models punya context <8K | warning |
| `auto-embeddings-only--{platform}` | Hanya ada embedding, tidak ada chat | info |
| `auto-all-free--{platform}` | Semua model dilabel free | info |

**Prioritas**: `INSERT OR IGNORE` — jadi operator/catalog quirks tidak akan di-overwrite.

### 4. Startup Behavior (autoDiscoverAll)
Sekarang **tidak skip** platform yang sudah punya chat models.
Dicek per-table: hanya skip kalau **ketiga-duanya** (chat + embeddings + media) sudah ada.

### 5. Periodic Refresh (setiap 12 jam + 5 menit setelah boot)
`refreshDiscoveredModels()` sekarang mencakup:
- Platform yang punya `source='user'` di **mana saja** (models / embedding_models / media_models)
- Setiap refresh, `autoDiscoverModels(platform, { refresh: true })` dijalankan → otomatis handle semua tipe

### 6. Logging
Console log sekarang detail:
```
[auto-discover] openrouter: chat 5reg/2ref/1ret, embed 3reg/1ref, media 2reg/0ref, 2 quirks auto-assigned
```

---

## Yang Tidak Berubah

- **Catalog sync** tetap jalan seperti biasa — catalog-sync tetap punya akses ke rows-nya sendiri
- **Models tetap `source='user'`** — catalog sync tidak pernah delete models yang di-discover
- **Quirk precedence** — operator > catalog > auto-discover
- **`startModelRefresh`** tetap 12h timer + 5 menit boot delay
- **`enabledModelCountForPlatform()`** sudah menghitung semua 3 table

---

## Flow Lengkap

```
User tambah API Key
        ↓
startCatalogSync() → fetch catalog dari server
        ↓
autoDiscoverAll() → untuk setiap platform yang belum lengkap:
  ├── GET /v1/models (pakai key user sendiri)
  ├── Filter free-tier
  ├── Split by kind (chat / embedding / media)
  ├── Verify access untuk chat (xkiro probe)
  ├── Register chat → models table
  ├── Register embed → embedding_models table
  ├── Register media → media_models table
  └── Auto-assign quirks → quirks + quirk_targets table
        ↓
setiap 12 jam → refreshDiscoveredModels():
  ├── Cari platform yang punya user-owned rows
  ├── Jalankan ulang autoDiscoverModels({refresh:true})
  └── Update/bench model yang berubah
```

---

## Contoh: OpenRouter

Sebelum bypass:
- ✅ Chat models terdaftar (via auto-discover lama)
- ❌ Embedding models tidak ada
- ❌ Media models tidak ada
- ❌ Quirks tidak ada

Sesudah bypass:
- ✅ Chat models terdaftar + verified
- ✅ Embedding models terdaftar (dimensions auto-detected)
- ✅ Media models terdaftar (image/audio/etc)
- ✅ Quirks auto-assigned: `auto-no-pricing--openrouter`, dll
- ✅ Semua di-refresh otomatis setiap 12 jam
