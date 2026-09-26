/**
 * auto-discover — Automatically discover and register models when a provider
 * key is added but the catalog hasn't shipped models for it yet.
 *
 * This bypasses the Premium catalog gate: instead of telling users to "add
 * Premium" or "add as custom endpoint", we query the provider's own /v1/models
 * endpoint with the user's key and register discovered models directly.
 *
 * Models are inserted with source='user' so catalog syncs never delete them.
 */

import type { Db } from '../db/types.js';
import { getDb } from '../db/index.js';
import { resolveProvider } from '../providers/index.js';
import { OpenAICompatProvider } from '../providers/openai-compat.js';
import { parseModelCatalog, classifyModelId } from './model-discovery.js';
import { ensureModelInProfiles } from './profile-models.js';
import type { Platform } from '@freellmapi/shared/types.js';

// Non-chat model patterns to exclude from chat model registration
const CHAT_EXCLUDE_KINDS = new Set(['embedding', 'image', 'audio', 'transcription', 'video']);

// Large provider list — skip auto-discover for these well-known providers
// that either don't have /v1/models, are handled by the catalog already,
// or are 100% paid and we don't want to register any of their models.
const SKIP_AUTO_DISCOVER = new Set([
  'ollama',       // local, handled separately
  'custom',       // custom endpoints use their own flow
  'aihorde',      // uses its own API format
  'bai',          // 100% paid — "Deposit required to unlock premium models"
  'cerebras',     // paid/exhausted — returns 402
]);

/** How many models to register per platform before giving up */
const MAX_AUTO_MODELS = 300;

/**
 * Count enabled models for a platform across all model tables.
 */
export function enabledModelCountForPlatform(platform: string): number {
  const db = getDb();
  const row = db.prepare(`
    SELECT (SELECT COUNT(*) FROM models           WHERE platform = ? AND enabled = 1)
         + (SELECT COUNT(*) FROM embedding_models WHERE platform = ? AND enabled = 1)
         + (SELECT COUNT(*) FROM media_models     WHERE platform = ? AND enabled = 1) AS c
  `).get(platform, platform, platform) as { c: number };
  return row.c;
}

/**
 * Discover and register models for a platform that has API keys but zero
 * models. Uses the provider's /v1/models endpoint with the user's own key.
 *
 * Returns the number of models registered, or 0 if nothing was needed or
 * discoverable.
 */
export async function autoDiscoverModels(platform: string): Promise<number> {
  if (SKIP_AUTO_DISCOVER.has(platform)) return 0;

  // Already has models — nothing to do
  if (enabledModelCountForPlatform(platform) > 0) return 0;

  const db = getDb();

  // Find an enabled key for this platform
  const keyRow = db.prepare(
    'SELECT id, encrypted_key, iv, auth_tag FROM api_keys WHERE platform = ? AND enabled = 1 LIMIT 1'
  ).get(platform) as { id: number; encrypted_key: string; iv: string; auth_tag: string } | undefined;

  if (!keyRow) return 0;

  // Resolve the provider
  const provider = resolveProvider(platform as Platform);
  if (!provider || !(provider instanceof OpenAICompatProvider)) return 0;

  // Decrypt the key (import dynamically to avoid circular deps)
  const { decrypt } = await import('../lib/crypto.js');
  let apiKey: string;
  try {
    apiKey = decrypt(keyRow.encrypted_key, keyRow.iv, keyRow.auth_tag);
  } catch {
    return 0;
  }

  // Fetch the provider's model catalog
  let models;
  let rawBody: unknown;
  try {
    const res = await provider.fetchModelCatalog(apiKey);
    if (!res.ok) {
      console.log(`[auto-discover] ${platform}/models returned HTTP ${res.status} — skipping`);
      return 0;
    }
    rawBody = await res.json();
    models = parseModelCatalog(rawBody);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[auto-discover] ${platform} discovery failed: ${msg}`);
    return 0;
  }

  if (models.length === 0) {
    console.log(`[auto-discover] ${platform} returned 0 models — skipping`);
    return 0;
  }

  // ── Free-tier filter ──────────────────────────────────────────────
  // We only want free models — loading paid ones causes 402/403 errors at
  // request time and clutters the routing chain with unusable entries.
  //
  // Strategy (ordered by priority):
  //   1. Providers with a `tier` field (e.g. airforce): only keep tier='free'
  //   2. Providers that use `:free` suffix convention (e.g. unorouter):
  //      only keep models whose id ends with ':free'
  //   3. Everything else: pass through (assumed free)
  let freeModels = models;
  const body = rawBody as Record<string, any>;
  const rawModels: any[] = Array.isArray(body?.data) ? body.data
    : Array.isArray(body?.models) ? body.models
    : Array.isArray(rawBody) ? rawBody as any[]
    : [];
  const hasTierField = rawModels.some((m: any) => typeof m?.tier === 'string');
  if (hasTierField) {
    // Build a set of free model ids from the raw response
    const freeIds = new Set<string>();
    for (const m of rawModels) {
      if (m.tier === 'free') freeIds.add(m.id);
    }
    freeModels = models.filter(m => freeIds.has(m.id));
    console.log(`[auto-discover] ${platform}: ${freeIds.size}/${rawModels.length} models are free-tier (${models.length} parsed → ${freeModels.length} after filter)`);
  } else {
    // No tier field — check if models use the `:free` suffix convention.
    // If ANY model id ends with ':free', assume this provider uses the pattern
    // and only keep those. Otherwise pass everything through.
    const hasColonFree = rawModels.some((m: any) => typeof m?.id === 'string' && m.id.endsWith(':free'));
    if (hasColonFree) {
      const beforeCount = freeModels.length;
      freeModels = freeModels.filter(m => m.id.endsWith(':free'));
      console.log(`[auto-discover] ${platform}: :free suffix filter (${beforeCount} → ${freeModels.length} models)`);
    }
  }

  // Filter to chat models only
  const chatModels = freeModels.filter(m => !m.kind || !CHAT_EXCLUDE_KINDS.has(m.kind));
  if (chatModels.length === 0) {
    console.log(`[auto-discover] ${platform} has ${freeModels.length} free models but none are chat models — skipping`);
    return 0;
  }

  // Classify model size from name heuristics
  function classifySize(modelId: string): string {
    const lower = modelId.toLowerCase();
    if (/70b|405b|120b|large|ultra|pro(?!mo)|max/i.test(lower)) return 'Large';
    if (/(?:8|9|14|20|27|32|34)b|medium/i.test(lower)) return 'Medium';
    if (/(?:3|4|7)b|tiny|nano|micro|small|lite|flash/i.test(lower)) return 'Small';
    return 'Medium';
  }

  // Insert models
  const selectExisting = db.prepare('SELECT id FROM models WHERE platform = ? AND model_id = ?');
  const insertModel = db.prepare(`
    INSERT INTO models (platform, model_id, display_name, source, enabled,
      intelligence_rank, speed_rank, size_label,
      supports_vision, supports_tools, context_window,
      rpm_limit, rpd_limit, tpm_limit, tpd_limit, monthly_token_budget)
    VALUES (?, ?, ?, 'user', 1,
      ?, ?, ?,
      ?, ?, ?,
      60, 1000, 100000, 1000000, '')
  `);

  const maxP = (db.prepare('SELECT COALESCE(MAX(priority), 0) AS mx FROM fallback_config').get() as { mx: number }).mx;
  const insertFb = db.prepare('INSERT INTO fallback_config (model_db_id, priority, enabled) VALUES (?, ?, 1)');

  let registered = 0;

  const tx = db.transaction(() => {
    let idx = 0;
    for (const m of chatModels.slice(0, MAX_AUTO_MODELS)) {
      // Skip if already exists
      if (selectExisting.get(platform, m.id)) continue;

      const size = classifySize(m.id);
      const vision = m.vision ? 1 : 0;
      const tools = /gpt|gemini|claude|mistral|qwen|llama.*3|deepseek|command/i.test(m.id) ? 1 : 0;
      const ctx = m.contextWindow ?? 128000;

      const info = insertModel.run(
        platform, m.id, m.id.replace(/[-_]/g, ' '),
        100 + idx, 100 + idx, size,
        vision, tools, ctx
      );

      // Add to fallback_config
      const modelDbId = info.lastInsertRowid as number;
      insertFb.run(modelDbId, maxP + 1 + idx);

      // Add to profiles that auto-include new models
      ensureModelInProfiles(db, modelDbId);

      registered++;
      idx++;
    }
  });

  tx();

  if (registered > 0) {
    console.log(`[auto-discover] ${platform}: registered ${registered} models from provider API`);
  }

  return registered;
}

/**
 * Discover models for ALL configured providers that have keys but zero models.
 * Called on startup and optionally on a timer.
 */
export async function autoDiscoverAll(): Promise<void> {
  const db = getDb();
  const configured = db.prepare(`
    SELECT DISTINCT platform FROM api_keys WHERE enabled = 1
  `).all() as { platform: string }[];

  for (const { platform } of configured) {
    if (SKIP_AUTO_DISCOVER.has(platform)) continue;
    if (enabledModelCountForPlatform(platform) > 0) continue;

    try {
      await autoDiscoverModels(platform);
    } catch (err) {
      console.warn(`[auto-discover] background discovery for ${platform} failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}
