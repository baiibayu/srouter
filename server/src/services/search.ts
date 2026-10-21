import { getDb, getSetting, setSetting } from '../db/index.js';
import { parseRetryAfterMs } from '../providers/base.js';
import { getClientContext } from '../lib/client-context.js';
import { RetryHintTracker } from '../lib/retry-hint.js';
import { isSearchPlatform } from '../lib/search-platforms.js';
import { proxyFetch } from '../lib/proxy.js';
import { TAVILY_BASE_URL } from '../providers/tavily.js';
import { EXA_BASE_URL } from '../providers/exa.js';
import { FIRECRAWL_BASE_URL } from '../providers/firecrawl.js';
import { LINKUP_BASE_URL } from '../providers/linkup.js';
import { PARALLEL_BASE_URL, PARALLEL_MCP_URL } from '../providers/parallel.js';
import { isAnonymousCredential } from '../lib/credential.js';
import { randomUUID } from 'node:crypto';
import { secondsUntilNextMonth } from './key-budget.js';
import { reserveProviderCredential, type ReservedProviderCredential } from './provider-credential.js';
import { isOnCooldown, setCooldown } from './ratelimit.js';
import {
  searchWeb, getWebSearchUsage,
  WEB_SEARCH_TAVILY_KEY, WEB_SEARCH_EXA_KEY,
  WEB_SEARCH_FIRECRAWL_KEY, WEB_SEARCH_LINKUP_KEY, WEB_SEARCH_BRAVE_KEY,
  getWebSearchConfig, getBaseUrl, getTinyfishApiKey, readKey,
} from './web-search.js';

// Web search over the key pool (#1174).
//
// Search engines are media_models rows with modality = 'search' (model_id is
// the engine id, e.g. 'tavily-search'). The catalog's `searchEngines` registry
// maintains them (see catalog-sync); nothing is bundled, so engines reach
// Premium first and Free 30 days later like any catalog row. A user can also
// register a custom endpoint that speaks Tavily's wire shape at POST {base_url}/search (POST /api/media/custom with
// modality 'search'), which binds the row to that endpoint's key.
//
// Routing: custom endpoints first (the operator's explicit relays), then the
// catalog engines in priority order (a local reorder from the dashboard wins
// over the catalog's order), then every healthy enabled key of the engine's
// platform. A rate-limited or out-of-credit key cools down per engine and the
// chain moves on; the first engine that returns hits wins. Every attempt is
// logged to search_requests for the dashboard's Search page and analytics.

export const SEARCH_MODALITY = 'search';

/** settings key holding the dashboard's local engine order: a JSON map of
 *  `${platform}:${engineId}` → priority. Kept out of media_models.priority so
 *  the next catalog apply (which rewrites that column) cannot undo it. */
const PRIORITY_OVERRIDES_SETTING = 'search_engine_priority';

const FETCH_TIMEOUT_MS = 30_000;
/** Page text per hit for the engines that return full content (Exa). Enough
 *  for a model to ground an answer without flooding its context. */
const CONTENT_CHARS = 1_500;
/** Cooldowns, per key and engine. */
/** Out of credits: free search credits reset on each account's own cycle, not
 *  a calendar month, so re-check twice a day instead of benching to month end. */

/** Cooldowns, per key and engine. */
const RATE_LIMIT_COOLDOWN_MS = 60_000;
const BAD_KEY_COOLDOWN_MS = 60 * 60_000;
/** Out of credits: free search credits reset on each account's own cycle, not
 *  a calendar month, so re-check twice a day instead of benching to month end. */
const NO_CREDIT_COOLDOWN_MS = 12 * 60 * 60_000;

const MAX_RESULTS = 20;
const DEFAULT_RESULTS = 5;

export interface SearchHit {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface SearchResponse {
  query: string;
  answer?: string;
  results: SearchHit[];
  /** Platform that served the search ('tavily', 'exa', ..., or 'custom'). */
  provider: string;
  /** Engine id that served the search ('tavily-search', ...). */
  engine: string;
}

export class SearchError extends Error {
  status: number;
  code?: string;
  retryAfterMs?: number;
  constructor(message: string, status: number, code?: string, retryAfterMs?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface SearchOptions {
  maxResults?: number;
  topic?: 'general' | 'news';
  includeAnswer?: boolean;
  /** Pin one engine by id; omitted or 'auto' walks the whole chain. */
  engine?: string;
  /** Agent the search runs for (e.g. 'claude-code'); defaults to the request's
   *  detected client. Recorded on search_requests. */
  clientAgent?: string | null;
  /** The caller's cancellation (a departed client). */
  signal?: AbortSignal;
}

export interface SearchEngineFeatures {
  news?: boolean;
  answer?: boolean;
  fullContent?: boolean;
}

export interface SearchEngineMeta {
  creditsPerQuery?: number | null;
  features?: SearchEngineFeatures;
  premiumSince?: string | null;
}

interface SearchEngineRow {
  id: number;
  platform: string;
  model_id: string;
  display_name: string;
  priority: number;
  enabled: number;
  quota_label: string;
  key_id: number | null;
  meta_json: string | null;
}

export function parseSearchMeta(raw: string | null): SearchEngineMeta {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as SearchEngineMeta;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// ── Engine order ─────────────────────────────────────────────────────────────

function engineKey(row: Pick<SearchEngineRow, 'platform' | 'model_id'>): string {
  return `${row.platform}:${row.model_id}`;
}

function readPriorityOverrides(): Record<string, number> {
  const raw = getSetting(PRIORITY_OVERRIDES_SETTING);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed ?? {})) {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function allEngineRows(): SearchEngineRow[] {
  return getDb()
    .prepare(`SELECT id, platform, model_id, display_name, priority, enabled, quota_label, key_id, meta_json
                FROM media_models WHERE modality = ? ORDER BY priority, id`)
    .all(SEARCH_MODALITY) as SearchEngineRow[];
}

/** Every search engine row in effective order (local reorder over catalog
 *  priority), each carrying its effective priority. */
function orderedEngines(): Array<SearchEngineRow & { effectivePriority: number }> {
  const overrides = readPriorityOverrides();
  return allEngineRows()
    .map(row => ({ ...row, effectivePriority: overrides[engineKey(row)] ?? row.priority }))
    .sort((a, b) => a.effectivePriority - b.effectivePriority || a.id - b.id);
}

// ── Adapters ────────────────────────────────────────────────────────────────

interface AdapterResult {
  answer?: string;
  results: SearchHit[];
}

type Adapter = (cred: ReservedProviderCredential, query: string, opts: SearchOptions, maxResults: number) => Promise<AdapterResult>;

async function upstream(url: string, platform: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
  const timeoutSignal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const res = await proxyFetch(
    url,
    { ...init, signal: signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal },
    platform,
    'search',
    FETCH_TIMEOUT_MS,
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new SearchError(
      `${platform} ${res.status}: ${body.slice(0, 200)}`,
      res.status,
      undefined,
      parseRetryAfterMs(res.headers?.get('retry-after') ?? null),
    );
  }
  // MCP servers may answer a POST as a one-event stream instead of plain JSON.
  if ((res.headers?.get('content-type') ?? '').includes('text/event-stream')) {
    return lastSseJson(await res.text());
  }
  return res.json();
}

/** The JSON payload of the last `data:` event in an SSE body. */
function lastSseJson(body: string): unknown {
  const data = body.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).filter(Boolean);
  if (data.length === 0) throw new SearchError('upstream sent an empty event stream', 502);
  return JSON.parse(data[data.length - 1]!);
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const clip = (v: string): string => (v.length > CONTENT_CHARS ? `${v.slice(0, CONTENT_CHARS)}…` : v);
/** Engines that do not score hits keep their own ranking: 1.0 down to ~0. */
const rankScore = (i: number, n: number): number => Number((1 - i / Math.max(n, 1)).toFixed(3));

// Some engines (Linkup) return page titles with their HTML entities intact
// ("Quelle est la capitale de l&#039;Australie"). Decode the common ones so
// every engine hands back plain text.
const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decodeEntities(v: string): string {
  if (!v.includes('&')) return v;
  return v.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[e.toLowerCase()] ?? m;
  });
}

function keepHits(hits: Array<{ title: string; url: string; content: string; score?: number }>): SearchHit[] {
  const valid = hits.filter(h => h.url);
  return valid.map((h, i) => ({
    title: decodeEntities(h.title),
    url: h.url,
    content: clip(decodeEntities(h.content)),
    score: typeof h.score === 'number' && Number.isFinite(h.score) ? h.score : rankScore(i, valid.length),
  }));
}

// Parallel's anonymous Search MCP asks for a stable conversation id on every
// call (used for its free-tier rate limiting); one per server process.
const PARALLEL_SESSION_ID = `srouter-${randomUUID()}`;
const RATE_LIMIT_TEXT = /rate.?limit|too many requests|quota/i;

/** Unwrap a JSON-RPC `tools/call` reply from Parallel's Search MCP into the
 *  REST-shaped search response its text content carries. */
function parallelMcpPayload(rpc: unknown): { results?: Array<Record<string, unknown>> } {
  const r = rpc as { error?: { message?: unknown }; result?: { isError?: boolean; content?: Array<{ type?: string; text?: unknown }> } };
  const text = (r?.result?.content ?? []).find(c => c?.type === 'text' && typeof c.text === 'string')?.text as string | undefined;
  const failure = typeof r?.error?.message === 'string' ? r.error.message : (r?.result?.isError ? (text ?? 'tool error') : null);
  if (failure !== null) {
    throw new SearchError(`parallel MCP: ${failure.slice(0, 200)}`, RATE_LIMIT_TEXT.test(failure) ? 429 : 502);
  }
  if (!text) throw new SearchError('parallel MCP returned no text content', 502);
  try {
    return JSON.parse(text) as { results?: Array<Record<string, unknown>> };
  } catch {
    throw new SearchError('parallel MCP returned non-JSON content', 502);
  }
}

/** Tavily's wire shape, shared by Tavily itself and custom search relays. */
async function tavilyShaped(url: string, platform: string, cred: ReservedProviderCredential, query: string, opts: SearchOptions, maxResults: number): Promise<AdapterResult> {
  const body: Record<string, unknown> = { query, max_results: maxResults };
  if (opts.topic) body.topic = opts.topic;
  if (opts.includeAnswer !== undefined) body.include_answer = opts.includeAnswer;
  const parsed = await upstream(url, platform, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cred.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, opts.signal) as { answer?: unknown; results?: Array<Record<string, unknown>> };
  const hits = (Array.isArray(parsed?.results) ? parsed.results : []).map(r => ({
    title: str(r.title),
    url: str(r.url),
    content: str(r.content),
    score: typeof r.score === 'number' ? r.score : undefined,
  }));
  return { answer: typeof parsed?.answer === 'string' ? parsed.answer : undefined, results: keepHits(hits) };
}

const ADAPTERS: Record<string, Adapter> = {
  // Keyless backends that do not use reserved provider credentials
  duckduckgo: async (_cred, query, _opts, maxResults) => {
    const results = await searchWeb(query, maxResults);
    return {
      answer: undefined,
      results: results.results.map(r => ({
        title: r.title,
        url: r.url,
        content: r.snippet,
        score: 1,
      })),
    };
  },

  searxng: async (_cred, _query, _opts, _maxResults) => {
    // searxng is configured via baseUrl in settings; keyless fallback handles it.
    // No dedicated adapter needed — the keyless chain routes to it when enabled.
    return { answer: undefined, results: [] };
  },

  // Catalog-managed keyed engines using settings slots
  tavily: async (cred, query, opts, maxResults) => {
    const key = readKey(WEB_SEARCH_TAVILY_KEY);
    if (!key) throw new SearchError("Tavily key not configured", 503, "no_key");
    return tavilyShaped(TAVILY_BASE_URL + "/search", "tavily", { ...cred, key }, query, opts, maxResults);
  },

  exa: async (cred, query, opts, maxResults) => {
    const key = readKey(WEB_SEARCH_EXA_KEY);
    if (!key) throw new SearchError("Exa key not configured", 503, "no_key");
    const body: Record<string, unknown> = { query, numResults: maxResults, type: "auto", contents: { text: { maxCharacters: CONTENT_CHARS } } };
    if (opts.topic === "news") body.category = "news";
    const parsed = await upstream(EXA_BASE_URL + "/search", "exa", {
      method: "POST",
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, opts.signal) as { results?: Array<Record<string, unknown>> };
    const hits = (parsed.results || []).map(r => ({
      title: str(r.title),
      url: str(r.url),
      content: str(r.text) || str(r.summary) || "",
    }));
    return { results: keepHits(hits) };
  },

  firecrawl: async (cred, query, opts, maxResults) => {
    const key = readKey(WEB_SEARCH_FIRECRAWL_KEY);
    if (!key) throw new SearchError("Firecrawl key not configured", 503, "no_key");
    const source = opts.topic === "news" ? "news" : "web";
    const parsed = await upstream(FIRECRAWL_BASE_URL + "/search", "firecrawl", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: maxResults, sources: [source] }),
    }, opts.signal) as { data?: { web?: Array<Record<string, unknown>>; news?: Array<Record<string, unknown>> } | Array<Record<string, unknown>> };
    const data = parsed.data ?? [];
    const rows = Array.isArray(data) ? data : (data[source] || data.web || []);
    const hits = (rows || []).map(r => ({
      title: str(r.title),
      url: str(r.url),
      content: str(r.description) || str(r.snippet) || str(r.markdown),
    }));
    return { results: keepHits(hits) };
  },

  linkup: async (cred, query, opts, maxResults) => {
    const key = readKey(WEB_SEARCH_LINKUP_KEY);
    if (!key) throw new SearchError("Linkup key not configured", 503, "no_key");
    const answer = opts.includeAnswer === true;
    const parsed = await upstream(LINKUP_BASE_URL + "/search", "linkup", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, depth: "standard", outputType: answer ? "sourcedAnswer" : "searchResults", maxResults }),
    }, opts.signal) as { sources?: Array<Record<string, unknown>>; results?: Array<Record<string, unknown>>; answer?: string };
    if (answer) {
      const hits = (parsed.sources || []).map(r => ({ title: str(r.name), url: str(r.url), content: str(r.snippet) }));
      return { answer: typeof parsed.answer === "string" ? parsed.answer : undefined, results: keepHits(hits) };
    }
    const hits = (parsed.results || []).filter(r => r.type === undefined || r.type === "text").map(r => ({ title: str(r.name), url: str(r.url), content: str(r.content) }));
    return { results: keepHits(hits) };
  },

  tinyfish: async (cred, query, _opts, _maxResults) => {
    const key = getTinyfishApiKey();
    if (!key) throw new SearchError("TinyFish key not configured", 503, "no_key");
    const params = new URLSearchParams({ query });
    const res = await upstream("https://api.search.tinyfish.ai?" + params.toString(), "tinyfish", {
      method: "GET",
      headers: { "x-api-key": key, accept: "application/json", "user-agent": "Mozilla/5.0" },
    }) as { results?: Array<{ title?: string; url?: string; snippet?: string }> };
    const hits = (res.results || []).map(r => ({
      title: str(r.title),
      url: str(r.url),
      content: str(r.snippet) || "",
      score: 1,
    }));
    return { results: keepHits(hits) };
  },

  brave: async (cred, query, opts, maxResults) => {
    const key = readKey(WEB_SEARCH_BRAVE_KEY);
    if (!key) throw new SearchError("Brave key not configured", 503, "no_key");
    const res = await upstream("https://api.search.brave.com/res/v1/web/search?q=" + encodeURIComponent(query) + "&count=" + maxResults, "brave", {
      method: "GET",
      headers: { "x-subscription-token": key, accept: "application/json", "user-agent": "Mozilla/5.0" },
    }, opts.signal) as { web?: { results?: Array<Record<string, unknown>> } };
    const hits = (res.web?.results || []).map(r => ({
      title: str(r.title),
      url: str(r.url),
      content: str(r.description) || "",
      score: 1,
    }));
    return { results: keepHits(hits) };
  },

  // Parallel uses MCP anonymous or REST keyed
  parallel: async (cred, query, opts, maxResults) => {
    const args = { objective: query, search_queries: [query] };
    const parsed = isAnonymousCredential(cred.key)
      ? parallelMcpPayload(await upstream(PARALLEL_MCP_URL, "parallel", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "web_search", arguments: { ...args, session_id: PARALLEL_SESSION_ID } },
          }),
        }, opts.signal))
      : await upstream(PARALLEL_BASE_URL + "/search", "parallel", {
          method: "POST",
          headers: { "x-api-key": cred.key.trim(), "Content-Type": "application/json" },
          body: JSON.stringify({ ...args, mode: "fast", advanced_settings: { max_results: maxResults } }),
        }, opts.signal) as { results?: Array<{ title?: string; url?: string; excerpts?: unknown[] }> };
    const hits = (parsed.results || []).slice(0, maxResults).map(r => ({
      title: str(r.title) || str(r.url),
      url: str(r.url),
      content: Array.isArray(r.excerpts) ? r.excerpts.filter((e: unknown): e is string => typeof e === "string").join(" … ") : "",
    }));
    return { results: keepHits(hits) };
  },

  // Custom search relays: the operator's own endpoint, bound to an api_keys
  // row (the key and base_url arrive via reserveProviderCredential in runSearch).
  custom: async (cred, query, opts, n) => {
    if (!cred.baseUrl) throw new SearchError("custom search endpoint has no base URL", 502);
    return tavilyShaped(`${cred.baseUrl}/search`, "custom", cred, query, opts, n);
  },
};

/** Platforms with a search adapter. catalog-sync gates searchEngines rows on
 *  this, the way VIDEO_PLATFORMS gates video rows. */
export const SEARCH_ENGINE_PLATFORMS = new Set(Object.keys(ADAPTERS).filter(p => p !== 'custom'));

/** The five locally-seeded search backends: the migration plants each of them
 *  and the dashboard's local reorder owns their order. The upstream catalog
 *  never publishes them, so applyCatalog must neither update nor prune their
 *  rows — the insert and prune loops gate on the complement instead. */
export const LOCAL_SEARCH_PLATFORMS = new Set([
  'duckduckgo', 'parallel', 'searxng', 'tinyfish', 'brave',
]);

/** Search platforms the upstream catalog publishes and therefore manages
 *  wholesale (insert + prune). Everything with an adapter that is not a local
 *  backend; a new keyed adapter defaults to catalog-managed until someone
 *  plants it locally and lists it in LOCAL_SEARCH_PLATFORMS. */
export const CATALOG_MANAGED_SEARCH_PLATFORMS = new Set(
  [...SEARCH_ENGINE_PLATFORMS].filter(p => !LOCAL_SEARCH_PLATFORMS.has(p)),
);

// ── Routing ─────────────────────────────────────────────────────────────────

function logSearch(row: SearchEngineRow, keyId: number | null, status: 'ok' | 'error', latencyMs: number, resultCount: number, clientAgent: string | null, error: string | null): void {
  try {
    getDb()
      .prepare(`INSERT INTO search_requests (engine_id, platform, key_id, status, latency_ms, result_count, client_agent, error)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(row.model_id, row.platform, keyId, status, latencyMs, resultCount, clientAgent, error);
  } catch (e) {
    console.error('Failed to log search request:', e);
  }
}

/** Bench this key for this engine according to what the upstream said. */
function coolDown(row: SearchEngineRow, keyId: number, e: SearchError): void {
  if (row.platform === 'custom') {
    if (e.status === 429) setCooldown(row.platform, row.model_id, keyId, e.retryAfterMs ?? RATE_LIMIT_COOLDOWN_MS);
    return;
  }
  if (e.status === 401 || e.status === 403) {
    setCooldown(row.platform, row.model_id, keyId, BAD_KEY_COOLDOWN_MS);
  } else if (e.status === 402 || e.status === 432 || e.status === 433) {
    // 402 (Exa, Firecrawl) and 432/433 (Tavily plan / pay-as-you-go cap):
    // the key's credits are spent.
    setCooldown(row.platform, row.model_id, keyId, NO_CREDIT_COOLDOWN_MS, 'credit');
  } else if (e.status === 429) {
    setCooldown(row.platform, row.model_id, keyId, e.retryAfterMs ?? RATE_LIMIT_COOLDOWN_MS);
  }
}

/** True when at least one enabled engine has a usable key (the keyed chain
 *  can run without waiting for the keyless fallback). */
function hasSearchKey(): boolean {
  const db = getDb();
  const config = getWebSearchConfig();
  for (const row of orderedEngines()) {
    if (row.enabled !== 1) continue;
    if (row.platform === 'custom') {
      if (row.key_id == null) continue;
      const k = db.prepare("SELECT 1 FROM api_keys WHERE id = ? AND enabled = 1 AND status IN ('healthy', 'unknown')").get(row.key_id);
      if (k) return true;
      continue;
    }
    if (!ADAPTERS[row.platform]) continue;
    // Keyless platforms (duckduckgo, parallel, searxng) are NOT counted here
    // - they are handled by the keyless fallback walker, not the keyed chain
    switch (row.platform) {
      case 'duckduckgo':
      case 'parallel':
      case 'searxng':
        break;
      case 'tavily':
        if (config.hasTavilyKey) return true;
        break;
      case 'exa':
        if (config.hasExaKey) return true;
        break;
      case 'firecrawl':
        if (config.hasFirecrawlKey) return true;
        break;
      case 'linkup':
        if (config.hasLinkupKey) return true;
        break;
      case 'brave':
        if (config.hasBraveKey) return true;
        break;
      case 'tinyfish':
        if (config.hasTinyfishKey) return true;
        break;
    }
  }
  return false;
}

/** DB-derived availability: true iff at least one enabled engine is runnable.
 *  Keyless platforms (duckduckgo, parallel) are always runnable when enabled.
 *  searxng needs a baseUrl; keyed platforms need a valid settings-slot key. */
export function searchAvailable(): boolean {
  const db = getDb();
  const enabledRows = db.prepare(`
    SELECT platform, model_id, key_id FROM media_models
    WHERE modality = ? AND enabled = 1
  `).all(SEARCH_MODALITY) as { platform: string; model_id: string; key_id: number | null }[];

  for (const row of enabledRows) {
    if (row.platform === 'duckduckgo' || row.platform === 'parallel') {
      return true;
    }
    if (row.platform === 'searxng' && getBaseUrl()) {
      return true;
    }
    const config = getWebSearchConfig();
    switch (row.platform) {
      case 'tinyfish': if (config.hasTinyfishKey) return true; break;
      case 'brave': if (config.hasBraveKey) return true; break;
      case 'tavily': if (config.hasTavilyKey) return true; break;
      case 'exa': if (config.hasExaKey) return true; break;
      case 'firecrawl': if (config.hasFirecrawlKey) return true; break;
      case 'linkup': if (config.hasLinkupKey) return true; break;
      case 'custom': if (row.key_id != null) return true; break;
    }
  }
  return false;
}

function searchChain(engine: string | undefined): SearchEngineRow[] {
  const db = getDb();
  const enabledRows = orderedEngines().filter(r => r.enabled === 1);

  // Filter to runnable engines: skip those that cannot work
  const runnable: SearchEngineRow[] = [];
  for (const row of enabledRows) {
    if (!ADAPTERS[row.platform]) continue;

    let canRun = false;
    if (row.platform === 'duckduckgo' || row.platform === 'parallel') {
      canRun = true;
    } else if (row.platform === 'searxng') {
      canRun = getBaseUrl().length > 0;
    } else if (row.platform === 'custom' && row.key_id != null) {
      const k = db.prepare("SELECT 1 FROM api_keys WHERE id = ? AND enabled = 1 AND status IN ('healthy', 'unknown')").get(row.key_id);
      canRun = !!k;
    } else {
      const config = getWebSearchConfig();
      switch (row.platform) {
        case 'tinyfish': canRun = config.hasTinyfishKey; break;
        case 'brave': canRun = config.hasBraveKey; break;
        case 'tavily': canRun = config.hasTavilyKey; break;
        case 'exa': canRun = config.hasExaKey; break;
        case 'firecrawl': canRun = config.hasFirecrawlKey; break;
        case 'linkup': canRun = config.hasLinkupKey; break;
      }
    }

    if (canRun) {
      runnable.push(row);
    }
  }

  // Custom relays first, then catalog engines
  const chain = [...runnable.filter(r => r.platform === 'custom'), ...runnable.filter(r => r.platform !== 'custom')];

  if (!engine || engine === 'auto') return chain;
  const pinned = chain.filter(r => r.model_id === engine);
  if (pinned.length === 0) {
    const known = orderedEngines().some(r => r.model_id === engine);
    throw new SearchError(
      known
        ? `Search engine '${engine}' is turned off. Turn it on from Models → Search, or use 'auto'.`
        : `Unknown search engine '${engine}'. Use 'auto' or an engine id from GET /v1/search/engines.`,
      400,
    );
  }
  return pinned;
}

export async function runSearch(query: string, opts: SearchOptions = {}): Promise<SearchResponse> {
  const chain = searchChain(opts.engine);
  const maxResults = Math.min(Math.max(1, Math.floor(opts.maxResults ?? DEFAULT_RESULTS)), MAX_RESULTS);
  const clientAgent = opts.clientAgent !== undefined ? opts.clientAgent : getClientContext().agent;

  let lastError: SearchError | null = null;
  let attempted = 0;
  let allRateLimited = true;
  const hints = new RetryHintTracker();
  for (const row of chain) {
    if (opts.signal?.aborted) throw new SearchError("search cancelled by the client", 499);

    if (row.platform === "custom") {
      const tried = new Set<number>();
      for (;;) {
        if (opts.signal?.aborted) throw new SearchError("search cancelled by the client", 499);
        const { credential, budgetBlocked } = reserveProviderCredential(
          row,
          0,
          keyId => tried.has(keyId) || isOnCooldown(row.platform, row.model_id, keyId),
        );
        if (!credential) {
          if (budgetBlocked) {
            lastError = new SearchError("Monthly key budget exhausted", 429, "quota_exceeded");
            hints.record(429, secondsUntilNextMonth() * 1000);
          }
          break;
        }
        tried.add(credential.id);
        attempted++;
        const started = Date.now();
        try {
          const out = await ADAPTERS[row.platform]!(credential, query, opts, maxResults);
          if (out.results.length === 0) throw new SearchError("upstream returned no valid search hits", 502);
          logSearch(row, credential.id, "ok", Date.now() - started, out.results.length, clientAgent, null);
          return {
            query,
            ...(out.answer ? { answer: out.answer } : {}),
            results: out.results,
            provider: row.platform,
            engine: row.model_id,
          };
        } catch (err: any) {
          const e = err instanceof SearchError ? err : new SearchError(String(err?.message ?? err), 502);
          logSearch(row, credential.id, "error", Date.now() - started, 0, clientAgent, e.message.slice(0, 300));
          coolDown(row, credential.id, e);
          lastError = e;
          if (e.status !== 429) allRateLimited = false;
          hints.record(e.status, e.retryAfterMs);
          if (opts.signal?.aborted) throw new SearchError("search cancelled by the client", 499);
          if (e.status === 400) break;
        } finally {
          credential.release();
        }
      }
      continue;
    }

    attempted++;
    const started = Date.now();
    try {
      const cred = { id: 0, key: "", baseUrl: null, release: () => {} };
      const out = await ADAPTERS[row.platform]!(cred, query, opts, maxResults);
      if (out.results.length === 0) throw new SearchError("upstream returned no valid search hits", 502);
      logSearch(row, 0, "ok", Date.now() - started, out.results.length, clientAgent, null);
      return {
        query,
        ...(out.answer ? { answer: out.answer } : {}),
        results: out.results,
        provider: row.platform,
        engine: row.model_id,
      };
    } catch (err: any) {
      const e = err instanceof SearchError ? err : new SearchError(String(err?.message ?? err), 502);
      logSearch(row, 0, "error", Date.now() - started, 0, clientAgent, e.message.slice(0, 300));
      coolDown(row, 0, e);
      lastError = e;
      if (e.status !== 429) allRateLimited = false;
      hints.record(e.status, e.retryAfterMs);
      if (opts.signal?.aborted) throw new SearchError("search cancelled by the client", 499);
      if (e.status === 400) break;
    }
  }

  let legacyError: string | null = null;
  if (!opts.engine || opts.engine === "auto") {
    try {
      const legacy = await searchWeb(query, maxResults);
      return {
        query,
        results: legacy.results.map((r) => ({ title: r.title, url: r.url, content: r.snippet, score: 1 })),
        provider: legacy.provider,
        engine: legacy.provider,
      };
    } catch (err: any) {
      legacyError = String(err?.message ?? err).slice(0, 160);
    }
  }
  const legacyNote = legacyError ? ` Keyless fallback: ${legacyError}.` : "";

  if (attempted === 0 && !lastError) {
    if (hasSearchKey()) {
      throw new SearchError(
        `Every search key is cooling down (rate limited or out of credits). Try again later or add another search key.${legacyNote}`,
        429,
        "search_keys_cooling_down",
      );
    }
    throw new SearchError(
      `No search key configured and the keyless fallback did not answer. Add a Tavily, Exa, Firecrawl or Linkup key on the Keys page.${legacyNote}`,
      503,
      "no_search_keys",
    );
  }
  const hasAttempts = attempted > 0 && allRateLimited;
  const status = hasAttempts ? 429 : 502;
  throw new SearchError(
    `All search engines failed${lastError ? ` (last: ${lastError.message.slice(0, 160)})` : " (no usable keys)"}.${legacyNote}`,
    status,
    lastError?.code,
    hasAttempts ? hints.retryAfterMs() : undefined,
  );
}

/** Whole seconds the client should wait before retrying: the upstream back-off
 *  when the chain was rate limited, else the monthly-budget reset. */
export function searchRetryAfterSec(err: SearchError): number | undefined {
  if (err.retryAfterMs !== undefined) return Math.ceil(err.retryAfterMs / 1000);
  if (err.code === 'quota_exceeded') return secondsUntilNextMonth();
  return undefined;
}

// ── Dashboard: engines ───────────────────────────────────────────────────────

/** Backends that answer with no key and no account at all — their engine row
 *  never needs a key slot (the dashboard badges them `keyless`). Only DuckDuckGo
 *  and Parallel are keyless. SearXNG is NOT keyless — it answers only through the
 *  operator's own instance URL. TinyFish is NOT keyless — its quota is
 *  "free up to 1,000 URLs/day, 150 URLs/min per key" (docs.tinyfish.ai). */
export function isKeylessSearchPlatform(platform: string): boolean {
  return platform === 'duckduckgo' || platform === 'parallel';
}

export interface SearchEngineView {
  id: number;
  platform: string;
  engineId: string;
  displayName: string;
  priority: number;
  enabled: boolean;
  quotaLabel: string;
  creditsPerQuery: number | null;
  features: SearchEngineFeatures;
  premiumSince: string | null;
  /** premiumSince + 30 days: when a free install receives the engine. */
  freeFrom: string | null;
  /** Runs with no key at all (duckduckgo, parallel) or has required config (searxng URL). */
  keyless: boolean;
  /** True if the engine is configured and ready to run. */
  configured: boolean;
  isCustom: boolean;
  keyCount: number;
  healthyKeyCount: number;
  searchesThisMonth: number;
}

const FREE_LAG_MS = 30 * 24 * 60 * 60 * 1000;

export function listSearchEngines(): SearchEngineView[] {
  const db = getDb();
  const keyRows = db.prepare(`
    SELECT id, platform, enabled, status FROM api_keys
     WHERE platform = 'custom' OR platform IN (${[...SEARCH_ENGINE_PLATFORMS].map(() => '?').join(', ')})
  `).all(...SEARCH_ENGINE_PLATFORMS) as { id: number; platform: string; enabled: number; status: string }[];
  const healthy = (k: { enabled: number; status: string }) => k.enabled === 1 && (k.status === 'healthy' || k.status === 'unknown');
  const monthCounts = new Map(
    (db.prepare(`
      SELECT platform, engine_id, COUNT(*) AS n FROM search_requests
       WHERE status = 'ok' AND created_at >= datetime('now', 'start of month')
       GROUP BY platform, engine_id
    `).all() as { platform: string; engine_id: string; n: number }[]).map(r => [`${r.platform}:${r.engine_id}`, r.n]),
  );
  // Legacy POST /v1/web-search traffic never reaches search_requests (the
  // walker has no engine row to log against), so its own monthly tally merges
  // in per platform — a backend counts once whichever endpoint served it.
  // Nothing double-counts: runSearch's keyless fallback returns without
  // logSearch, and only status='ok' rows are summed on the search_requests side.
  const legacyMonthly = getWebSearchUsage().monthly;

  return orderedEngines().map(row => {
    const meta = parseSearchMeta(row.meta_json);
    const keys = row.platform === 'custom'
      ? keyRows.filter(k => k.id === row.key_id)
      : row.platform === 'duckduckgo' || row.platform === 'parallel' || row.platform === 'searxng'
        ? []  // Keyless platforms have no api_keys entries
        : keyRows.filter(k => k.platform === row.platform);
    const premiumSince = typeof meta.premiumSince === 'string' ? meta.premiumSince : null;
    const premiumMs = premiumSince ? Date.parse(premiumSince) : NaN;
    return {
      id: row.id,
      platform: row.platform,
      engineId: row.model_id,
      displayName: row.display_name,
      priority: row.effectivePriority,
      enabled: row.enabled === 1,
      quotaLabel: row.quota_label,
      creditsPerQuery: typeof meta.creditsPerQuery === 'number' ? meta.creditsPerQuery : null,
      features: meta.features ?? {},
      premiumSince,
      freeFrom: Number.isFinite(premiumMs) ? new Date(premiumMs + FREE_LAG_MS).toISOString() : null,
      keyless: isKeylessSearchPlatform(row.platform),
      configured: (() => {
        if (row.platform === 'duckduckgo' || row.platform === 'parallel') return true;
        if (row.platform === 'searxng') return getBaseUrl().length > 0;
        const cfg = getWebSearchConfig();
        switch (row.platform) {
          case 'tinyfish': return cfg.hasTinyfishKey;
          case 'brave': return cfg.hasBraveKey;
          case 'tavily': return cfg.hasTavilyKey;
          case 'exa': return cfg.hasExaKey;
          case 'firecrawl': return cfg.hasFirecrawlKey;
          case 'linkup': return cfg.hasLinkupKey;
          case 'custom': return row.key_id != null;
          default: return false;
        }
      })(),
      isCustom: row.platform === 'custom',
      keyCount: keys.length,
      healthyKeyCount: (() => {
        if (row.platform === "duckduckgo" || row.platform === "parallel" || row.platform === "searxng") {
          return row.enabled === 1 ? 1 : 0;
        }
        const config = getWebSearchConfig();
        switch (row.platform) {
          case "tavily": return config.hasTavilyKey ? 1 : 0;
          case "exa": return config.hasExaKey ? 1 : 0;
          case "firecrawl": return config.hasFirecrawlKey ? 1 : 0;
          case "linkup": return config.hasLinkupKey ? 1 : 0;
          case "brave": return config.hasBraveKey ? 1 : 0;
          case "tinyfish": return config.hasTinyfishKey ? 1 : 0;
          case "custom": return keys.filter(healthy).length;
          default: return 0;
        }
      })(),
      searchesThisMonth: (monthCounts.get(engineKey(row)) ?? 0)
        + (row.platform === 'custom' ? 0 : legacyMonthly[row.platform] ?? 0),
    };
  });
}

/** Turn an engine on/off and/or move it to `priority` (0 = first/default).
 *  A move renumbers every engine 0..n-1 in the new order and stores that as
 *  the local order. Returns false when the id is not a search engine. */
export function updateSearchEngine(id: number, patch: { enabled?: boolean; priority?: number }): boolean {
  const db = getDb();
  const ordered = orderedEngines();
  const target = ordered.find(r => r.id === id);
  if (!target) return false;
  if (patch.enabled !== undefined) {
    db.prepare('UPDATE media_models SET enabled = ? WHERE id = ?').run(patch.enabled ? 1 : 0, id);
  }
  if (patch.priority !== undefined) {
    const rest = ordered.filter(r => r.id !== id);
    const index = Math.max(0, Math.min(Math.floor(patch.priority), rest.length));
    rest.splice(index, 0, target);
    const overrides: Record<string, number> = {};
    rest.forEach((r, i) => { overrides[engineKey(r)] = i; });
    setSetting(PRIORITY_OVERRIDES_SETTING, JSON.stringify(overrides));
  }
  return true;
}

// ── Dashboard: analytics ────────────────────────────────────────────────────

export type SearchAnalyticsRange = '24h' | '7d' | '30d' | '90d' | 'all';

export interface SearchAnalytics {
  total: number;
  today: number;
  successRate: number;
  avgLatencyMs: number;
  byEngine: Array<{ engineId: string; displayName: string; count: number }>;
  series: Array<{ date: string; engineId: string; count: number }>;
}

function rangeSince(range: SearchAnalyticsRange): string | null {
  const days = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 } as const;
  if (range === 'all') return null;
  const ms = Date.now() - days[range] * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

/** Searches over a range: totals count successful searches; successRate and
 *  latency are over every attempt (a failed attempt that failed over is
 *  still a cost the operator wants to see). */
export function searchAnalytics(range: SearchAnalyticsRange): SearchAnalytics {
  const db = getDb();
  const since = rangeSince(range);
  const where = since ? 'WHERE created_at >= ?' : '';
  const args = since ? [since] : [];

  const totals = db.prepare(`
    SELECT COUNT(*) AS attempts,
           COALESCE(SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END), 0) AS ok,
           COALESCE(AVG(latency_ms), 0) AS avg_latency
      FROM search_requests ${where}
  `).get(...args) as { attempts: number; ok: number; avg_latency: number };
  const today = (db.prepare(`
    SELECT COUNT(*) AS n FROM search_requests WHERE status = 'ok' AND created_at >= datetime('now', 'start of day')
  `).get() as { n: number }).n;
  // Legacy walker attempts keep only a today/month bucket and no history, so
  // today's attempts fold in here (and into each engine row's monthly count).
  // The logs are disjoint per attempt: the keyed path never writes
  // web_search_usage, and the keyless fallback never writes search_requests.
  const legacyToday = Object.values(getWebSearchUsage().daily).reduce((n, v) => n + v, 0);

  const names = new Map(allEngineRows().map(r => [r.model_id, r.display_name]));
  const byEngine = (db.prepare(`
    SELECT engine_id, COUNT(*) AS n FROM search_requests
     ${where ? `${where} AND` : 'WHERE'} status = 'ok'
     GROUP BY engine_id ORDER BY n DESC, engine_id
  `).all(...args) as { engine_id: string; n: number }[])
    .map(r => ({ engineId: r.engine_id, displayName: names.get(r.engine_id) ?? r.engine_id, count: r.n }));
  const series = (db.prepare(`
    SELECT date(created_at) AS day, engine_id, COUNT(*) AS n FROM search_requests
     ${where ? `${where} AND` : 'WHERE'} status = 'ok'
     GROUP BY day, engine_id ORDER BY day, engine_id
  `).all(...args) as { day: string; engine_id: string; n: number }[])
    .map(r => ({ date: r.day, engineId: r.engine_id, count: r.n }));

  return {
    total: totals.ok,
    today: today + legacyToday,
    // Percent, 0–100, one decimal: the same scale as the chat summary.
    successRate: totals.attempts > 0 ? Math.round((totals.ok / totals.attempts) * 1000) / 10 : 0,
    avgLatencyMs: Math.round(totals.avg_latency),
    byEngine,
    series,
  };
}

/** Search platforms are not chat providers; re-exported for routes that
 *  decorate the provider list. */
export { isSearchPlatform };
