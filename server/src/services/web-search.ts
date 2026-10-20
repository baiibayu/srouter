// Key slots for the unified search chain (#1174).
// Each platform has its own settings key — the Keys page edits them side by side.
import { getSetting, setSetting, getDb } from '../db/index.js';
import { decodeEntities, stripTags } from '../lib/html.js';

export const WEB_SEARCH_BASE_URL_KEY = 'web_search_base_url';
// One key slot per keyed backend — each is a separate free-tier account, and
// the Keys page edits them side by side (settings.web_search_api_key from the
// first cut was a single shared slot; never released, dropped without a
// migration).
export const WEB_SEARCH_TAVILY_KEY = 'web_search_tavily_key';
export const WEB_SEARCH_BRAVE_KEY = 'web_search_brave_key';
export const WEB_SEARCH_EXA_KEY = 'web_search_exa_key';
// Firecrawl/Linkup are catalog-only search engines (no legacy-walker backend),
// but their keys are free-tier accounts the Keys page edits beside the other
// six — stored here so the slots exist contract-complete before an adapter
// consumes them.
export const WEB_SEARCH_FIRECRAWL_KEY = 'web_search_firecrawl_key';
export const WEB_SEARCH_LINKUP_KEY = 'web_search_linkup_key';
// One TinyFish key is account-wide: it powers the search backend AND the
// /v1/fetch reader chain — hence the name outside the web_search_* prefix.
export const TINYFISH_API_KEY = 'tinyfish_api_key';
// Local tally of search attempts per backend — providers expose no "quota
// left" API, so the Web tab shows these counts against the published free
// tiers. One JSON blob; daily/monthly buckets roll over on read.
const WEB_SEARCH_USAGE_KEY = 'web_search_usage';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const SEARCH_TIMEOUT_MS = 15_000;

export interface WebSearchConfig {
  baseUrl: string;
  /** Whether a Tavily/Brave/Exa/TinyFish key is stored — the keys themselves never leave the server. */
  hasTavilyKey: boolean;
  hasBraveKey: boolean;
  hasExaKey: boolean;
  hasTinyfishKey: boolean;
  /** Stored Firecrawl/Linkup slot (catalog engines — no walker backend yet). */
  hasFirecrawlKey: boolean;
  hasLinkupKey: boolean;
}

export function readKey(settingKey: string): string | null {
  const raw = getSetting(settingKey);
  return raw === undefined || raw.trim() === '' ? null : raw;
}

export function getWebSearchConfig(): WebSearchConfig {
  const baseUrlRaw = getSetting(WEB_SEARCH_BASE_URL_KEY);
  return {
    baseUrl: baseUrlRaw?.trim() ?? '',
    hasTavilyKey: readKey(WEB_SEARCH_TAVILY_KEY) !== null,
    hasBraveKey: readKey(WEB_SEARCH_BRAVE_KEY) !== null,
    hasExaKey: readKey(WEB_SEARCH_EXA_KEY) !== null,
    hasTinyfishKey: readKey(TINYFISH_API_KEY) !== null,
    hasFirecrawlKey: readKey(WEB_SEARCH_FIRECRAWL_KEY) !== null,
    hasLinkupKey: readKey(WEB_SEARCH_LINKUP_KEY) !== null,
  };
}

/** Stored TinyFish key (shared by the search backend and /v1/fetch); null when unset. */
export function getTinyfishApiKey(): string | null {
  return readKey(TINYFISH_API_KEY);
}

interface UsageState {
  d: string;
  m: string;
  daily: Record<string, number>;
  monthly: Record<string, number>;
}

function usagePeriods(): { d: string; m: string } {
  const d = new Date().toISOString().slice(0, 10);
  return { d, m: d.slice(0, 7) };
}

function rollUsage(raw: string | undefined): UsageState {
  const { d, m } = usagePeriods();
  let s: UsageState = { d, m, daily: {}, monthly: {} };
  if (raw) {
    try { s = JSON.parse(raw) as UsageState; } catch { /* corrupt blob → start fresh */ }
  }
  if (s.d !== d) s.daily = {};
  if (s.m !== m) s.monthly = {};
  s.d = d;
  s.m = m;
  return s;
}

/** One attempted request against a backend (success or failure — rate limits
 * and failed calls consume the same free tier as successful ones). */
export function recordWebSearchAttempt(backend: string): void {
  const s = rollUsage(getSetting(WEB_SEARCH_USAGE_KEY));
  s.daily[backend] = (s.daily[backend] ?? 0) + 1;
  s.monthly[backend] = (s.monthly[backend] ?? 0) + 1;
  setSetting(WEB_SEARCH_USAGE_KEY, JSON.stringify(s));
}

/** Counts for the current day/month; buckets roll over automatically. */
export function getWebSearchUsage(): { daily: Record<string, number>; monthly: Record<string, number> } {
  const s = rollUsage(getSetting(WEB_SEARCH_USAGE_KEY));
  return { daily: s.daily, monthly: s.monthly };
}

/** SearXNG instance base URL; '' when unset. Exported for use by the unified search adapter. */
export function getBaseUrl(): string {
  const raw = getSetting(WEB_SEARCH_BASE_URL_KEY);
  return raw?.trim() ?? '';
}

export interface WebSearchPatch {
  baseUrl?: string | null;
  tavilyKey?: string | null;
  braveKey?: string | null;
  exaKey?: string | null;
  tinyfishKey?: string | null;
  firecrawlKey?: string | null;
  linkupKey?: string | null;
}

// Partial update; null/empty clears the stored value (mirrors the complexity
// gate's write-only key handling in services/complexity-gate.ts).
export function setWebSearchConfig(patch: WebSearchPatch): void {
  if (patch.baseUrl !== undefined) {
    if (patch.baseUrl === null || patch.baseUrl.trim() === '') {
      getDb().prepare('DELETE FROM settings WHERE key = ?').run(WEB_SEARCH_BASE_URL_KEY);
    } else {
      setSetting(WEB_SEARCH_BASE_URL_KEY, patch.baseUrl.trim());
    }
  }
  for (const [value, settingKey] of [
    [patch.tavilyKey, WEB_SEARCH_TAVILY_KEY],
    [patch.braveKey, WEB_SEARCH_BRAVE_KEY],
    [patch.exaKey, WEB_SEARCH_EXA_KEY],
    [patch.tinyfishKey, TINYFISH_API_KEY],
    [patch.firecrawlKey, WEB_SEARCH_FIRECRAWL_KEY],
    [patch.linkupKey, WEB_SEARCH_LINKUP_KEY],
  ] as const) {
    if (value === undefined) continue;
    if (value === null || value.trim() === '') {
      getDb().prepare('DELETE FROM settings WHERE key = ?').run(settingKey);
    } else {
      setSetting(settingKey, value.trim());
    }
  }
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

// ── DuckDuckGo (default, keyless) ──

function resolveDdgHref(href: string): string | null {
  const abs = href.startsWith('//') ? `https:${href}` : href;
  try {
    const u = new URL(abs);
    if (u.hostname.endsWith('duckduckgo.com') && u.pathname === '/l/') {
      return u.searchParams.get('uddg');
    }
    return u.toString();
  } catch {
    return null;
  }
}

/** Parse DuckDuckGo's HTML result page (no-key backend). Exported for tests. */
export function parseDdgHtml(html: string): WebSearchResult[] {
  const links: { url: string; title: string }[] = [];
  const linkRe = /<a\b([^>]*class="result__a"[^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const href = m[1].match(/href="([^"]+)"/i)?.[1];
    if (!href) continue;
    const url = resolveDdgHref(decodeEntities(href));
    if (!url) continue;
    const title = stripTags(m[2]).trim();
    if (title) links.push({ url, title });
  }
  const snippets: string[] = [];
  const snippetRe = /<[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div|span)>/gi;
  while ((m = snippetRe.exec(html)) !== null) {
    snippets.push(stripTags(m[1]).replace(/\s+/g, ' ').trim());
  }
  return links.map((l, i) => ({ ...l, snippet: snippets[i] ?? '' }));
}

async function searchDuckduckgo(query: string, maxResults: number): Promise<WebSearchResult[]> {
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: { 'user-agent': UA, accept: 'text/html' },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`search backend responded ${res.status}`);
  const html = await res.text();
  const results = parseDdgHtml(html);
  // A captcha/anomaly/rate page comes back HTTP 200 with zero results — that
  // must not masquerade as "the web has no answer".
  if (results.length === 0) throw new Error('search backend returned no results (rate limited?)');
  return results.slice(0, maxResults);
}

// ── SearXNG (self-host, keyless) ──

/** Normalize a backend's row shape into hits, keeping rows with a URL. */
function mapHits(
  rows: Array<{ title?: string; url?: string; snippet?: string }> | undefined,
  maxResults: number,
): WebSearchResult[] {
  const out: WebSearchResult[] = [];
  for (const row of rows ?? []) {
    if (typeof row.url !== 'string' || row.url === '') continue;
    out.push({
      url: row.url,
      title: (row.title ?? row.url).trim(),
      snippet: (row.snippet ?? '').trim(),
    });
    if (out.length >= maxResults) break;
  }
  return out;
}

async function searchSearxng(baseUrl: string, query: string, maxResults: number): Promise<WebSearchResult[]> {
  const base = baseUrl.replace(/\/+$/, '');
  if (!base) throw new Error('SearXNG backend needs an instance URL (Keys page → Web search)');
  const res = await fetch(`${base}/search?format=json&q=${encodeURIComponent(query)}`, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`SearXNG responded ${res.status}`);
  let data: { results?: Array<{ url?: string; title?: string; content?: string }> };
  try {
    data = await res.json() as typeof data;
  } catch {
    throw new Error('SearXNG answered non-JSON (enable format=json on the instance)');
  }
  return mapHits((data.results ?? []).map(r => ({ title: r.title, url: r.url, snippet: r.content })), maxResults);
}

// ── Keyless fallback walker (interim shim while the Fase B chain rewrite lands) ──

export interface WebSearchAttempt {
  backend: string;
  ok: boolean;
  /** Failure message; absent on success. */
  error?: string;
}

export async function searchWeb(
  query: string,
  maxResults: number,
): Promise<{ provider: string; results: WebSearchResult[]; attempts?: WebSearchAttempt[] }> {
  const attempts: WebSearchAttempt[] = [];
  const errors: string[] = [];
  const chain: Array<[string, () => Promise<WebSearchResult[]>]> = [
    ['duckduckgo', () => searchDuckduckgo(query, maxResults)],
  ];
  const baseUrl = getBaseUrl();
  if (baseUrl) chain.push(['searxng', () => searchSearxng(baseUrl, query, maxResults)]);
  for (const [backend, run] of chain) {
    recordWebSearchAttempt(backend);
    try {
      const results = await run();
      attempts.push({ backend, ok: true });
      return attempts.length > 1
        ? { provider: backend, results, attempts }
        : { provider: backend, results };
    } catch (err: any) {
      const message = err?.message ?? String(err);
      attempts.push({ backend, ok: false, error: message });
      errors.push(`${backend}: ${message}`);
    }
  }
  throw new Error(errors.join(' | '));
}
