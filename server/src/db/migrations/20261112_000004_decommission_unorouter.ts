import type { Db } from '../types.js';

export const filename = '20261112_000004_decommission_unorouter.ts';

export function up(db: Db): void {
  // UnoRouter's free aggregator routes are incompatible with coding agents:
  // 1. Upstream drops function calling and answers in plain conversational prose.
  // 2. Latency of 60-90s per request with 1 req/min limits causes ladder stalls.
  // 3. Traps agents like Claude Code in infinite conversational repetition loops.
  //
  // Disable UnoRouter models and purge from fallback chains:
  db.prepare(`
    UPDATE models 
    SET enabled = 0, supports_tools = 0 
    WHERE platform = 'unorouter'
  `).run();

  db.prepare(`
    DELETE FROM fallback_config 
    WHERE model_db_id IN (
      SELECT id FROM models WHERE platform = 'unorouter'
    )
  `).run();

  db.prepare(`
    DELETE FROM profile_models 
    WHERE model_db_id IN (
      SELECT id FROM models WHERE platform = 'unorouter'
    )
  `).run();
}

export function down(_db: Db): void {
  throw new Error('irreversible migration: decommissioned unorouter fallback entries cannot be automatically restored');
}
