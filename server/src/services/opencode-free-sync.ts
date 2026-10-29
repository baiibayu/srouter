/**
 * opencode-free-sync — Auto-discover and sync free models from OpenCode's
 * zen free tier. Runs on boot and every 12h (follows catalog-sync interval).
 *
 * Fetches `/zen/v1/models` with Bearer public + CLI identity headers,
 * filters to known-free models (suffix `-free` or in the FREE_MODEL_IDS set),
 * then INSERT-or-UPDATEs into the models table with source='user' so the
 * catalog sync never prunes them. Also ensures fallback_config and
 * profile_models rows exist for each discovered model.
 *
 * Unlike auto-discover.ts, this does NOT require an API key — it uses the
 * same forged CLI identity that opencode-free.ts uses for chat completions.
 */

import { getDb } from '../db/index.js';
import { ensureModelInProfiles } from './profile-models.js';
import type { Scheduler } from '../lib/scheduler.js';

// ── OpenCode Free Tier Identity (mirrors opencode-free.ts) ─────────────────

const UPSTREAM_BASE = 'https://opencode.ai/inference/v1';

const USER_AGENT = 'opencode/latest/2.0.26/cli';

const BASE62 =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

// Zen timestamp encoding: descending time so the newest IDs sort first.
// The official OpenCode CLI uses this scheme; the free-tier gate checks it.
const SESSION_PREFIX_MASK = (1n << 48n) - 1n;

function descendingTimeHex(time: number, counterValue: number): string {
  return (~(BigInt(time) * 0x1000n + BigInt(counterValue)) & SESSION_PREFIX_MASK)
    .toString(16)
    .padStart(12, '0');
}

function cryptoBase62(n: number): string {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return Array.from(b, (x) => BASE62[x % 62]).join('');
}

let sessionCounter = 0;
let lastSessionTime = 0;

function genSessionId(): string {
  const now = Date.now();
  if (now !== lastSessionTime) {
    lastSessionTime = now;
    sessionCounter = 0;
  }
  sessionCounter++;
  return `ses_${descendingTimeHex(now, sessionCounter)}${cryptoBase62(14)}`;
}

let requestCounter = 0;
let lastRequestTime = 0;

function genRequestId(): string {
  const now = Date.now();
  if (now !== lastRequestTime) {
    lastRequestTime = now;
    requestCounter = 0;
  }
  requestCounter++;
  return `msg_${descendingTimeHex(now, requestCounter)}${cryptoBase62(14)}`;
}

function identityHeaders(): Record<string, string> {
  const sessionId = genSessionId();
  return {
    Authorization: 'Bearer public',
    'User-Agent': USER_AGENT,
    'x-opencode-client': 'cli',
    'x-opencode-session': sessionId,
    'x-opencode-session-id': sessionId,
    'x-session-affinity': sessionId,
    'x-session-id': sessionId,
    'x-opencode-request': genRequestId(),
    'x-opencode-project': 'global',
    'Accept': 'application/json',
  };
}

// ── Free model detection ───────────────────────────────────────────────────
// OpenCode's free models use the `-free` suffix convention. We also maintain
// a set of known free IDs that may lack the suffix (e.g. `big-pickle`).

const FREE_SUFFIX = '-free';

/** Known free model IDs that don't use the `-free` suffix. */
const KNOWN_FREE_IDS = new Set([
  'big-pickle',
  'flint-40b-free',
  'beam-free',
  'glm-5.3-flash-free',
  'mimo-v2.6-flash-free',
  'deepseek-v4.1-flash-free',
  'nemotron-3.5-lightning-free',
  'nemotron-3.5-super-vl-free',
]);

function isFreeModel(modelId: string): boolean {
  // Exclude non-chat / internal routing / systemone models
  if (modelId.startsWith('jev-') || modelId === 'test') return false;
  return modelId.endsWith(FREE_SUFFIX) || KNOWN_FREE_IDS.has(modelId);
}

// ── Model rank inference (lightweight version) ─────────────────────────────

function inferRanks(modelId: string): { intel: number; spd: number } {
  const lower = modelId.toLowerCase();
  let intel = 100;
  let spd = 100;

  if (/(?:^|-)(?:flash|mini|fast|lite|tiny|nano)(?:$|-)/i.test(lower)) spd = 80;
  if (/(?:^|-)(?:haiku|small)(?:$|-)/i.test(lower)) spd = 85;
  if (/(?:^|-)(?:large|ultra|thinking|reasoning)(?:$|-)/i.test(lower)) spd = 115;
  if (/(?:^|-)(?:pro|max)(?:$|-)/i.test(lower)) spd = 110;

  if (/(?:^|-)(?:flash|mini|tiny|nano|lite)(?:$|-)/i.test(lower)) intel = 120;
  if (/(?:^|-)(?:opus|sonnet)(?:$|-)/i.test(lower)) intel = 85;
  if (/(?:^|-)(?:pro|max)(?:$|-)/i.test(lower)) intel = 85;

  return { intel, spd };
}

function classifySize(modelId: string): string {
  const lower = modelId.toLowerCase();
  if (/70b|405b|120b|large|ultra|pro|max/i.test(lower)) return 'Large';
  if (/(?:8|9|14|20|27|32|34)b|medium/i.test(lower)) return 'Medium';
  if (/(?:3|4|7)b|tiny|nano|micro|small|lite|flash/i.test(lower)) return 'Small';
  return 'Medium';
}

// ── Fetch upstream model list ───────────────────────────────────────────────

interface UpstreamModel {
  id: string;
  owned_by?: string;
}

interface FetchedFreeResult {
  chatModels: UpstreamModel[];
  decisionModels: UpstreamModel[];
}

async function fetchFreeModels(): Promise<FetchedFreeResult> {
  const res = await fetch(`${UPSTREAM_BASE}/models`, {
    method: 'GET',
    headers: identityHeaders(),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`OpenCode Free models endpoint returned HTTP ${res.status}`);
  }

  const body = await res.json() as { data?: UpstreamModel[] };
  const all = body.data ?? [];
  return {
    chatModels: all.filter((m) => isFreeModel(m.id)),
    decisionModels: all.filter((m) => m.id.startsWith('jev-') && m.id.endsWith(FREE_SUFFIX)),
  };
}

// ── Sync logic ─────────────────────────────────────────────────────────────

export interface FreeSyncResult {
  added: number;
  updated: number;
  retired: number;
  skipped: number;
  total: number;
  models: string[];
  error?: string;
}

/**
 * Sync free models from OpenCode's zen endpoint into the local DB.
 * Called on boot and periodically by the scheduler.
 */
export async function syncOpenCodeFreeModels(): Promise<FreeSyncResult> {
  const result: FreeSyncResult = {
    added: 0,
    updated: 0,
    retired: 0,
    skipped: 0,
    total: 0,
    models: [],
  };

  let fetched: FetchedFreeResult;
  try {
    fetched = await fetchFreeModels();
  } catch (err: any) {
    result.error = err?.message ?? String(err);
    console.error(`[opencode-free-sync] fetch failed: ${result.error}`);
    return result;
  }

  const freeModels = fetched.chatModels;
  result.total = freeModels.length;
  if (freeModels.length === 0) {
    console.log('[opencode-free-sync] upstream returned 0 free models — skipping');
    return result;
  }

  const db = getDb();
  const platform = 'opencode-free';

  // ── Prepare statements ──────────────────────────────────────────
  const selectExisting = db.prepare(
    'SELECT id, display_name, context_window, enabled FROM models WHERE platform = ? AND model_id = ?',
  );
  const insertModel = db.prepare(`
    INSERT INTO models (platform, model_id, display_name, source, enabled,
      intelligence_rank, speed_rank, size_label,
      supports_vision, supports_tools, context_window,
      rpm_limit, rpd_limit, tpm_limit, tpd_limit, monthly_token_budget)
    VALUES (?, ?, ?, 'user', 1,
      ?, ?, ?,
      0, 1, ?,
      ?, ?, ?, ?, ?)
  `);
  const updateModel = db.prepare(
    'UPDATE models SET display_name = ?, context_window = ?, enabled = 1 WHERE id = ?',
  );
  const selectMaxFbPriority = db.prepare(
    'SELECT COALESCE(MAX(priority), 0) AS mx FROM fallback_config',
  );
  const selectFbExists = db.prepare(
    'SELECT id FROM fallback_config WHERE model_db_id = ?',
  );
  const insertFb = db.prepare(
    'INSERT INTO fallback_config (model_db_id, priority, enabled) VALUES (?, ?, 1)',
  );

  // Free tier conservative limits (unpublished; based on other keyless providers)
  const RPM = 5;
  const RPD = 200;
  const TPM = null;
  const TPD = null;

  // ── Transaction ─────────────────────────────────────────────────
  const newModelNames: string[] = [];

  db.transaction(() => {
    let fbPriority = (selectMaxFbPriority.get() as { mx: number }).mx;

    for (const m of freeModels) {
      const existing = selectExisting.get(platform, m.id) as {
        id: number; display_name: string; context_window: number | null; enabled: number;
      } | undefined;

      if (existing) {
        // Model already exists — just make sure it's enabled
        if (!existing.enabled) {
          updateModel.run(m.id.replace(/[-_]/g, ' '), 128_000, existing.id);
          result.updated++;
        }
        result.skipped++;
        result.models.push(m.id);
        continue;
      }

      // Insert new model
      const ranks = inferRanks(m.id);
      const size = classifySize(m.id);
      const ctx = 128_000; // default context window for free models
      const display = m.id.replace(/[-_]/g, ' ');

      insertModel.run(
        platform, m.id, display,
        ranks.intel, ranks.spd, size,
        ctx,
        RPM, RPD, TPM, TPD, '',
      );

      // Get the inserted model ID and ensure fallback_config
      const row = db.prepare('SELECT id FROM models WHERE platform = ? AND model_id = ?').get(platform, m.id) as { id: number } | undefined;
      if (row) {
        if (!selectFbExists.get(row.id)) {
          fbPriority++;
          insertFb.run(row.id, fbPriority);
        }
        ensureModelInProfiles(db, row.id);
        newModelNames.push(m.id);
      }

      result.added++;
      result.models.push(m.id);
    }

    // Purge any opencode-free models that are no longer available upstream or unsupported
    const activeIds = new Set(freeModels.map((m) => m.id));
    const allDbModels = db.prepare('SELECT id, model_id, enabled FROM models WHERE platform = ?').all(platform) as Array<{
      id: number;
      model_id: string;
      enabled: number;
    }>;
    const deleteFb = db.prepare('DELETE FROM fallback_config WHERE model_db_id = ?');
    const deleteModel = db.prepare('DELETE FROM models WHERE id = ?');
    for (const m of allDbModels) {
      if (!activeIds.has(m.model_id)) {
        deleteFb.run(m.id);
        deleteModel.run(m.id);
        result.retired++;
      }
    }

    // Sync free decision models (Jev) into media_models (modality = 'decision')
    const insertMediaDecision = db.prepare(`
      INSERT INTO media_models (platform, model_id, display_name, modality, priority, enabled, quota_label, meta_json)
      VALUES (?, ?, ?, 'decision', ?, 1, 'Keyless Zen Free', '{"contextWindow":32768}')
    `);
    const selectMediaDecision = db.prepare(
      'SELECT id FROM media_models WHERE platform = ? AND model_id = ? AND modality = ?'
    );
    for (const dm of fetched.decisionModels) {
      const existingDm = selectMediaDecision.get(platform, dm.id, 'decision');
      if (!existingDm) {
        insertMediaDecision.run(
          platform,
          dm.id,
          dm.id === 'jev-1.13-free' ? 'OpenCode Zen (Jev 1.13 Free)' : `OpenCode Zen (${dm.id})`,
          1,
        );
      }
    }
  })();

  console.log(
    `[opencode-free-sync] done: ${result.added} added, ${result.updated} updated, ${result.skipped} existing, ${result.total} total free models`,
  );
  if (newModelNames.length > 0) {
    console.log(`[opencode-free-sync] new models: ${newModelNames.join(', ')}`);
  }

  return result;
}

// ── Scheduler integration ───────────────────────────────────────────────────
const BOOT_DELAY_MS = 30_000; // 30s after boot (let server settle)
const SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours

export function startOpenCodeFreeSync(scheduler: Scheduler): (() => void) | null {
  // Run on boot (delayed) then every 12h
  scheduler.after(BOOT_DELAY_MS, () => {
    void syncOpenCodeFreeModels();
  });

  const stop = scheduler.every(SYNC_INTERVAL_MS, () => {
    void syncOpenCodeFreeModels();
  }, { name: 'opencode-free-sync' });

  return stop;
}
