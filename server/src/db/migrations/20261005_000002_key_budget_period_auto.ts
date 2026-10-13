import type { Db } from '../types.js';

/** Guard so the migration can be re-run safely (roundtrip/catalog-sync tests re-run up()). */
function hasColumn(db: Db, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return columns.some(col => col.name === column);
}

/**
 * Per-key budget period AUTO mode (#1158 follow-up): a separate
 * `budget_period_mode` column ('auto' | 'manual') records whether the key's
 * `budget_period` was chosen by the operator or resolved from the provider's
 * catalog declaration.
 *
 * The column is kept apart from `budget_period` on purpose: the ledger trigger
 * (migration 20261005_000001) reads `budget_period` and MUST stay concrete
 * (daily / weekly / monthly) — an 'auto' value there would break the CASE
 * bucket. Auto resolution lives in services/key-budget.ts and writes the
 * concrete period into `budget_period` while leaving `budget_period_mode =
 * 'auto'` so the trigger sees a real window.
 *
 * Existing rows (and new INSERTs that omit the column) inherit 'auto': no user
 * has ever picked a manual period before this feature shipped, so the default
 * matches the pre-existing behaviour (resolve from the catalog).
 */
export function up(db: Db): void {
  if (!hasColumn(db, 'api_keys', 'budget_period_mode')) {
    db.prepare("ALTER TABLE api_keys ADD COLUMN budget_period_mode TEXT NOT NULL DEFAULT 'auto'").run();
    // Weekly is never produced by auto resolution — an existing weekly pick was
    // made manually in the 0.4.0 dialog and must survive the auto backfill.
    db.prepare("UPDATE api_keys SET budget_period_mode = 'manual' WHERE budget_period = 'weekly'").run();
  }
}

export function down(db: Db): void {
  if (hasColumn(db, 'api_keys', 'budget_period_mode')) {
    try {
      db.prepare('ALTER TABLE api_keys DROP COLUMN budget_period_mode').run();
    } catch {
      // best-effort: some builds pin the table; leaving the column harms nobody
    }
  }
}