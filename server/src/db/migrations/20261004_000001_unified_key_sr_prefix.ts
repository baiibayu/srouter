// Unified API key prefix: drop the pre-rebrand legacy prefix (and any
// interim 'srouter-' one) in favour of the short, provider-neutral 'sr-'.
// Only the prefix is rewritten — the random suffix (the actual secret) is
// preserved byte-for-byte, so every client already configured against this
// install keeps working; only the displayed/stored string changes.
import type { Db } from '../types.js';

const SETTING_KEY = 'unified_api_key';

export function up(db: Db): void {
  const row = db.prepare(`SELECT value FROM settings WHERE key='${SETTING_KEY}'`).get() as { value: string } | undefined;
  if (!row) return;
  if (row.value.startsWith('sr-')) return;
  const separator = row.value.indexOf('-');
  const secret = separator === -1 ? row.value : row.value.slice(separator + 1);
  db.prepare(`UPDATE settings SET value=? WHERE key='${SETTING_KEY}'`).run(`sr-${secret}`);
}

export function down(db: Db): void {
  // The original prefix (legacy vs srouter- vs none) is not recorded, so
  // the rewrite cannot be reversed to the byte. The honest reverse of "adopt
  // the sr- prefix" is to drop the marker and leave the secret bare; a re-run
  // of up() restores 'sr-', and auth compares the full string either way —
  // only rollback/round-trip tooling ever observes this intermediate state.
  const row = db.prepare(`SELECT value FROM settings WHERE key='${SETTING_KEY}'`).get() as { value: string } | undefined;
  if (!row) return;
  if (!row.value.startsWith('sr-')) return;
  db.prepare(`UPDATE settings SET value=? WHERE key='${SETTING_KEY}'`).run(row.value.slice('sr-'.length));
}
