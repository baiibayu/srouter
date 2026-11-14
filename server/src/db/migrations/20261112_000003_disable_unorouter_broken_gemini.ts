import type { Db } from '../types.js';

export const filename = '20261112_000003_disable_unorouter_broken_gemini.ts';

export function up(db: Db): void {
  // UnoRouter's Gemini models are scraped web sessions that lack true tool execution
  // and trigger conversational loops or Google Drive workspace lockouts.
  // 1. Disable UnoRouter Gemini models and unset supports_tools
  db.prepare(`
    UPDATE models 
    SET enabled = 0, supports_tools = 0 
    WHERE platform = 'unorouter' AND model_id LIKE '%gemini%'
  `).run();

  // 2. Remove UnoRouter Gemini models from fallback_config so fallback chains never select them
  db.prepare(`
    DELETE FROM fallback_config 
    WHERE model_db_id IN (
      SELECT id FROM models WHERE platform = 'unorouter' AND model_id LIKE '%gemini%'
    )
  `).run();

  // 3. Remove UnoRouter Gemini models from profile_models
  db.prepare(`
    DELETE FROM profile_models 
    WHERE model_db_id IN (
      SELECT id FROM models WHERE platform = 'unorouter' AND model_id LIKE '%gemini%'
    )
  `).run();
}

export function down(_db: Db): void {
  throw new Error('irreversible migration: disabled broken models and fallback entries cannot be automatically restored');
}
