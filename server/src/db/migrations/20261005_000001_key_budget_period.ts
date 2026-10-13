import type { Db } from '../types.js';

/** Guard so the migration can be re-run safely (roundtrip/catalog-sync tests re-run up()). */
function hasColumn(db: Db, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return columns.some(col => col.name === column);
}

// Days since Monday of the week containing d (Mon=0 … Sun=6), matching
// (getUTCDay() + 6) % 7 on the TypeScript side.
const MONDAY_OFFSET = `((CAST(strftime('%w', NEW.created_at) AS INTEGER) + 6) % 7)`;

// Period-aware bucket, mirroring periodBucket() in services/key-budget.ts:
//   daily   'd:YYYY-MM-DD'
//   weekly  'w:YYYY-MM-DD' (Monday of the UTC week)
//   monthly 'YYYY-MM'      (bare — the pre-existing format, so historical
//                           ledger rows stay readable)
// The prefixes keep daily and weekly buckets from colliding with each other
// when a key's period is switched (a bare Monday date would equal that day's
// daily bucket).
const BUCKET_CASE = `
  CASE (SELECT budget_period FROM api_keys WHERE id = NEW.key_id)
    WHEN 'daily'  THEN 'd:' || strftime('%Y-%m-%d', NEW.created_at)
    WHEN 'weekly' THEN 'w:' || strftime('%Y-%m-%d', date(NEW.created_at, '-' || ${MONDAY_OFFSET} || ' days'))
    ELSE strftime('%Y-%m', NEW.created_at)
  END`;

// The monthly-only trigger body, for down() and for installs that roll back.
function createMonthlyTrigger(db: Db): void {
  db.exec(`
    CREATE TRIGGER requests_key_monthly_usage
    AFTER INSERT ON requests
    WHEN NEW.key_id IS NOT NULL AND NEW.status = 'success'
      AND strftime('%Y-%m', NEW.created_at) IS NOT NULL
    BEGIN
      INSERT INTO key_monthly_usage (key_id, month, requests, tokens)
      VALUES (NEW.key_id, strftime('%Y-%m', NEW.created_at), 1,
              MAX(0, NEW.input_tokens) + MAX(0, NEW.output_tokens))
      ON CONFLICT(key_id, month) DO UPDATE SET
        requests = requests + 1,
        tokens = tokens + excluded.tokens;
    END;
  `);
}

/**
 * Per-key budget periods: the ledger trigger buckets successful requests by
 * the key's budget_period (daily / weekly / monthly, UTC boundaries) instead
 * of always by month. Switching a key's period starts the new counter at
 * zero — old buckets are namespaced away rather than reinterpreted.
 */
export function up(db: Db): void {
  if (!hasColumn(db, 'api_keys', 'budget_period')) {
    db.prepare("ALTER TABLE api_keys ADD COLUMN budget_period TEXT NOT NULL DEFAULT 'monthly'").run();
  }
  db.exec('DROP TRIGGER IF EXISTS requests_key_monthly_usage');
  db.exec(`
    CREATE TRIGGER requests_key_monthly_usage
    AFTER INSERT ON requests
    WHEN NEW.key_id IS NOT NULL AND NEW.status = 'success'
      AND strftime('%Y-%m', NEW.created_at) IS NOT NULL
    BEGIN
      INSERT INTO key_monthly_usage (key_id, month, requests, tokens)
      SELECT NEW.key_id, ${BUCKET_CASE}, 1,
             MAX(0, NEW.input_tokens) + MAX(0, NEW.output_tokens)
      ON CONFLICT(key_id, month) DO UPDATE SET
        requests = requests + 1,
        tokens = tokens + excluded.tokens;
    END;
  `);
}

export function down(db: Db): void {
  db.exec('DROP TRIGGER IF EXISTS requests_key_monthly_usage');
  createMonthlyTrigger(db);
  if (hasColumn(db, 'api_keys', 'budget_period')) {
    try {
      db.prepare('ALTER TABLE api_keys DROP COLUMN budget_period').run();
    } catch {
      // best-effort: some builds pin the table; leaving the column harms nobody
    }
  }
}
