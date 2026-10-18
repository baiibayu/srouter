/**
 * export-catalog — build the signed catalog product from the live srouter DB.
 *
 * This is the single source of truth pipeline: every model and its resolved
 * quirks come straight out of the same SQLite DB the router uses, so the
 * published catalog can never drift from what the gateway actually serves.
 * The output JSON is what the standalone catalog server (../../catalog) hands
 * to clients — a monthly snapshot to all users.
 *
 * The catalog is ONE document covering every modality: chat models (models[],
 * with modality 'image'/'audio' entries routed to media_models), embeddings
 * (embeddings[]), speech-to-text (transcriptionModels[]) and text-to-video
 * (videoModels[]). The separate top-level keys for transcription/video exist
 * so binaries that predate those modalities ignore them instead of
 * misclassifying the rows as chat models.
 *
 * Usage:
 *   tsx src/scripts/export-catalog.ts [--db <path>] [--out <path>]
 *                                     [--version <YYYY.MM.DD[.N]>] [--tier live|monthly]
 *                                     [--stdout] [--bundled]
 *
 * Defaults: reads the server's data/srouter.db, writes the suite's
 * catalog/data/catalog.live.json. The catalog server signs it separately
 * (catalog/src/scripts/sign-catalog.ts) so the signature covers the exact
 * bytes served.
 *
 * --bundled writes server/src/catalog/bundled-catalog.ts instead — a
 * generated TypeScript module exporting BUNDLED_CATALOG, compiled into the
 * server binary. This is the standalone (no remote catalog server) path:
 * trust equals the installed package, no Ed25519 signature is needed or
 * checked, and boot applies it synchronously with zero network.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, getDb } from '../db/index.js';
import { getAllProviders } from '../providers/index.js';
import { resolveQuirksByModel, quirkKey, listQuirkDefinitions } from '../services/quirks.js';
import { MEDIA_PLATFORMS, TRANSCRIPTION_PLATFORMS, VIDEO_PLATFORMS } from '../services/media.js';
import { EMBEDDING_PLATFORMS } from '../services/embeddings.js';
import { SEARCH_ENGINE_PLATFORMS } from '../services/search.js';
import { DECISION_PLATFORMS } from '../services/decision.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_SRC_ROOT = path.resolve(__dirname, '..'); // server/src
const SUITE_ROOT = path.resolve(__dirname, '../../../..'); // srouter/server/src/scripts -> suite root

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function dateVersion(d = new Date()): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
}

interface ModelRow {
  platform: string;
  model_id: string;
  display_name: string;
  intelligence_rank: number;
  speed_rank: number;
  size_label: string;
  rpm_limit: number | null;
  rpd_limit: number | null;
  tpm_limit: number | null;
  tpd_limit: number | null;
  monthly_token_budget: string;
  context_window: number | null;
  enabled: number;
  supports_vision: number;
  supports_tools: number;
}

interface EmbeddingRow {
  family: string;
  platform: string;
  model_id: string;
  display_name: string;
  dimensions: number;
  max_input_tokens: number | null;
  priority: number;
  enabled: number;
  quota_label: string;
}

interface MediaRow {
  platform: string;
  model_id: string;
  display_name: string;
  modality: string;
  priority: number;
  enabled: number;
  quota_label: string;
  meta_json: string | null;
}

function main() {
  const dbPath = arg('db');
  const tier = (arg('tier') as 'live' | 'monthly' | undefined) ?? 'live';
  const version = arg('version') ?? dateVersion();

  // In --stdout mode stdout must carry ONLY the JSON document; incidental
  // logs (e.g. initDb's "Database initialized at ...") go to stderr instead.
  if (flag('stdout')) console.log = console.error;

  initDb(dbPath);
  const db = getDb();

  const models = db
    .prepare(
      `SELECT platform, model_id, display_name, intelligence_rank, speed_rank, size_label,
              rpm_limit, rpd_limit, tpm_limit, tpd_limit, monthly_token_budget, context_window,
              enabled, supports_vision, supports_tools
         FROM models
        ORDER BY intelligence_rank ASC, platform ASC, model_id ASC`,
    )
    .all() as ModelRow[];

  const embeddings = db
    .prepare(
      `SELECT family, platform, model_id, display_name, dimensions, max_input_tokens,
              priority, enabled, quota_label
         FROM embedding_models
        WHERE platform IN (${[...EMBEDDING_PLATFORMS].map(() => '?').join(',')})
        ORDER BY family ASC, priority ASC, platform ASC, model_id ASC`,
    )
    .all(...EMBEDDING_PLATFORMS) as EmbeddingRow[];

  const mediaAll = db
    .prepare(
      `SELECT platform, model_id, display_name, modality, priority, enabled, quota_label, meta_json
         FROM media_models
        ORDER BY modality ASC, priority ASC, platform ASC, model_id ASC`,
    )
    .all() as MediaRow[];

  const quirksByModel = resolveQuirksByModel(db);
  const quirkDefs = listQuirkDefinitions(db);

  // Only platforms that actually have a registered provider AND a model in the
  // catalog — skip 'custom' (user-supplied endpoint, nothing to publish).
  const livePlatforms = new Set<string>();
  for (const m of models) livePlatforms.add(m.platform);
  for (const m of embeddings) livePlatforms.add(m.platform);
  for (const m of mediaAll) livePlatforms.add(m.platform);
  const platforms = getAllProviders()
    .filter((p) => p.platform !== 'custom' && livePlatforms.has(p.platform))
    .map((p) => ({ id: p.platform, name: p.name }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // Chat models (modality absent/'text') plus generative-media rows that ride
  // in models[] with modality 'image'/'audio' (see services/catalog-sync.ts
  // MEDIA_MODALITIES). Transcription and video have their own top-level keys.
  const chatModels = models.map((m) => ({
    platform: m.platform,
    modelId: m.model_id,
    displayName: m.display_name,
    intelligenceRank: m.intelligence_rank,
    speedRank: m.speed_rank,
    sizeLabel: m.size_label,
    limits: {
      rpm: m.rpm_limit,
      rpd: m.rpd_limit,
      tpm: m.tpm_limit,
      tpd: m.tpd_limit,
    },
    monthlyTokenBudget: m.monthly_token_budget,
    contextWindow: m.context_window,
    enabled: m.enabled === 1,
    supportsVision: m.supports_vision === 1,
    supportsTools: m.supports_tools === 1,
    quirks: quirksByModel.get(quirkKey(m.platform, m.model_id)) ?? [],
  }));

  const imageAudioModels = mediaAll
    .filter((m) => (m.modality === 'image' || m.modality === 'audio') && MEDIA_PLATFORMS.has(m.platform))
    .map((m) => {
      const meta = m.meta_json ? (JSON.parse(m.meta_json) as { requestStyle?: string }) : {};
      return {
        platform: m.platform,
        modelId: m.model_id,
        displayName: m.display_name,
        modality: m.modality,
        intelligenceRank: m.priority, // applyCatalog uses intelligenceRank as media priority
        speedRank: m.priority,
        sizeLabel: '',
        limits: { rpm: null, rpd: null, tpm: null, tpd: null },
        monthlyTokenBudget: null,
        contextWindow: null,
        enabled: m.enabled === 1,
        supportsVision: false,
        supportsTools: false,
        mediaNote: m.quota_label || undefined,
        requestStyle: meta.requestStyle ?? undefined,
        quirks: [] as unknown[],
      };
    });

  const catalogModels = [...chatModels, ...imageAudioModels];

  const catalogEmbeddings = embeddings.map((m) => ({
    family: m.family,
    platform: m.platform,
    modelId: m.model_id,
    displayName: m.display_name,
    dimensions: m.dimensions,
    maxInputTokens: m.max_input_tokens,
    priority: m.priority,
    enabled: m.enabled === 1,
    quotaLabel: m.quota_label,
  }));

  const transcriptionModels = mediaAll
    .filter((m) => m.modality === 'transcription' && TRANSCRIPTION_PLATFORMS.has(m.platform))
    .map((m) => {
      const meta = m.meta_json
        ? (JSON.parse(m.meta_json) as { subtitleFormats?: string[]; maxBytes?: number; requestStyle?: string })
        : {};
      return {
        platform: m.platform,
        modelId: m.model_id,
        displayName: m.display_name,
        priority: m.priority,
        enabled: m.enabled === 1,
        subtitleFormats: meta.subtitleFormats,
        maxBytes: meta.maxBytes,
        requestStyle: meta.requestStyle,
        quotaLabel: m.quota_label || undefined,
      };
    });

  const videoModels = mediaAll
    .filter((m) => m.modality === 'video' && VIDEO_PLATFORMS.has(m.platform))
    .map((m) => {
      const meta = m.meta_json ? (JSON.parse(m.meta_json) as { providerModelId?: string }) : {};
      return {
        platform: m.platform,
        modelId: m.model_id,
        displayName: m.display_name,
        priority: m.priority,
        enabled: m.enabled === 1,
        quotaLabel: m.quota_label || undefined,
        providerModelId: meta.providerModelId,
      };
    });

  const searchEngines = mediaAll
    .filter((m) => m.modality === 'search' && SEARCH_ENGINE_PLATFORMS.has(m.platform))
    .map((m) => {
      const meta = m.meta_json
        ? (JSON.parse(m.meta_json) as {
            creditsPerQuery?: number;
            features?: { news?: boolean; answer?: boolean; fullContent?: boolean };
            premiumSince?: string;
          })
        : {};
      return {
        platform: m.platform,
        engineId: m.model_id,
        displayName: m.display_name,
        priority: m.priority,
        enabled: m.enabled === 1,
        quotaLabel: m.quota_label || undefined,
        creditsPerQuery: meta.creditsPerQuery,
        features: meta.features,
        premiumSince: meta.premiumSince,
      };
    });

  const decisionModels = mediaAll
    .filter((m) => m.modality === 'decision' && DECISION_PLATFORMS.has(m.platform))
    .map((m) => {
      const meta = m.meta_json ? (JSON.parse(m.meta_json) as { contextWindow?: number; premiumSince?: string }) : {};
      return {
        platform: m.platform,
        modelId: m.model_id,
        displayName: m.display_name,
        priority: m.priority,
        enabled: m.enabled === 1,
        quotaLabel: m.quota_label || undefined,
        contextWindow: meta.contextWindow,
        premiumSince: meta.premiumSince,
      };
    });

  const catalog = {
    version,
    generatedAt: new Date().toISOString(),
    tier,
    counts: {
      platforms: platforms.length,
      models: catalogModels.length,
      enabledModels: catalogModels.filter((m) => m.enabled).length,
      embeddings: catalogEmbeddings.length,
      transcriptionModels: transcriptionModels.length,
      videoModels: videoModels.length,
      searchEngines: searchEngines.length,
      enabledSearchEngines: searchEngines.filter((e) => e.enabled).length,
      decisionModels: decisionModels.length,
      enabledDecisionModels: decisionModels.filter((m) => m.enabled).length,
      quirks: quirkDefs.length,
    },
    platforms,
    models: catalogModels,
    embeddings: catalogEmbeddings,
    transcriptionModels,
    videoModels,
    searchEngines,
    decisionModels,
    quirks: quirkDefs,
  };

  const json = JSON.stringify(catalog, null, 2) + '\n';

  if (flag('stdout')) {
    process.stdout.write(json);
    return;
  }

  if (flag('bundled')) {
    // Generated TypeScript module compiled into the server binary — the
    // standalone catalog path. Typed as `unknown` so tsc skips deep literal
    // inference on a ~1000-row document; catalog-sync's isCatalog() is the
    // runtime structural check (cheap, runs once at boot). The JSON is
    // intentionally NOT pretty-printed: compact form keeps the committed
    // source ~30% smaller (hundreds of KB on a full catalog).
    const ts = `// AUTO-GENERATED by src/scripts/export-catalog.ts --bundled — DO NOT EDIT.
// Regenerate: npx tsx src/scripts/export-catalog.ts --bundled --version <YYYY.MM.DD.N>
// Bundled model catalog: applied at boot when CATALOG_BASE_URL is unset
// (standalone mode — no remote catalog server, no signature, trust equals
// the installed package).
export const BUNDLED_CATALOG_VERSION = ${JSON.stringify(version)};
export const BUNDLED_CATALOG: unknown = ${JSON.stringify(catalog)};
`;
    const outPath = path.join(SERVER_SRC_ROOT, 'catalog', 'bundled-catalog.ts');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, ts);
    console.log(
      `Wrote bundled catalog ${version}: ${catalog.counts.models} models ` +
        `(${catalog.counts.enabledModels} enabled), ${catalog.counts.embeddings} embeddings, ` +
        `${catalog.counts.transcriptionModels} transcription, ${catalog.counts.videoModels} video, ` +
        `${catalog.counts.platforms} platforms, ${catalog.counts.quirks} quirks -> ${outPath}`,
    );
    return;
  }

  const outPath = arg('out') ?? path.join(SUITE_ROOT, 'catalog', 'data', `catalog.${tier}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, json);
  console.log(
    `Wrote ${tier} catalog ${version}: ${catalog.counts.models} models ` +
      `(${catalog.counts.enabledModels} enabled), ${catalog.counts.embeddings} embeddings, ` +
      `${catalog.counts.transcriptionModels} transcription, ${catalog.counts.videoModels} video, ` +
      `${catalog.counts.platforms} platforms, ${catalog.counts.quirks} quirks -> ${outPath}`,
  );
}

main();
