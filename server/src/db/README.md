<div align="center">

# 🗄️ Database Migrations & Catalog Storage

### Schema Versioning & Model Storage for SRouter AI Gateway

[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Encryption](https://img.shields.io/badge/Security-AES--256--GCM-blue)](https://nodejs.org/api/crypto.html)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/baiibayu/srouter/blob/main/LICENSE)

</div>

---

## 🧭 Overview

SRouter utilizes an embedded SQLite database (`srouter.db`) for high performance, zero external infrastructure dependencies, and strict local-first privacy.

All schema evolution is managed through forward/backward migrations located in `server/src/db/migrations/`.

---

## 🛠️ Migration Commands

Run migration commands from the monorepo root:

### 1. Run Pending Migrations
Applies all pending migrations to the local database file:
```bash
npm run db:migration:up
```
*(Production startup automatically applies pending migrations before starting the HTTP server).*

### 2. Create a New Migration
Generates a new timestamped migration file in `server/src/db/migrations/`:
```bash
npm run db:migration:create --name=add_new_feature_table
```

### 3. Check Migration Status
Lists all applied and pending migration files:
```bash
npm run db:migration:status
```

### 4. Roll Back Latest Migration
Reverts the most recently applied batch of migrations:
```bash
npm run db:migration:down
```

### 5. Fresh Database (Development / Testing Only)
Drops all application tables and re-runs all migrations from scratch:
```bash
npm run db:migration:fresh
```

> [!CAUTION]
> Never run `db:migration:fresh` in production or on an active instance with stored provider keys, as it will permanently delete existing data.

---

## 🔒 Encrypted Tables & Security

Sensitive provider API credentials stored in SQLite are encrypted at rest using **AES-256-GCM** with an initialization vector (IV) and authentication tag. The encryption key is derived from the environment variable `ENCRYPTION_KEY`.

---

## 🤖 Built-in Model Catalog

The initial catalog of ~1,200+ free and tiered models is seeded through baseline database migrations. New models, updated rate limits, and provider quirks can be introduced via new forward migrations or auto-synced twice daily via the Ed25519-signed remote catalog feed.

---

## 📄 License

Open-source under the [MIT License](https://github.com/baiibayu/srouter/blob/main/LICENSE).
Crafted by **[@baiibayu](https://github.com/baiibayu)** & community contributors.
