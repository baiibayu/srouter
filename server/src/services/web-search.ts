// Web search backends for POST /v1/web-search — keyless first.
//
//   duckduckgo (default, keyless) — DDG HTML scraping, no account, no quota
//   searxng                      — your own SearXNG instance, keyless
//   tavily / brave / exa         — free-tier API key (no card), stored locally
//   tinyfish                     — free key (Search is free at any balance,
//                                  12k req/day); the same key also feeds the
//                                  /v1/fetch reader chain
//
// The active backend is an operator setting (GET/PUT /api/settings/web-search)
// and is tried first. On failure searchWeb walks a fixed fallback chain —
// DuckDuckGo (keyless), SearXNG (own instance), then the keyed backends from
// the largest free quota to the smallest (tinyfish → exa → brave → tavily) —
// so a rate-limited DDG or a dead provider does not fail the request. The
// whole walk runs in one ~25s budget so a dead network cannot stack timeouts.
// Only when the budget or the whole chain runs out does the route answer
// 502, with every backend's error joined so the first cause stays visible; a
// request that needed more than one attempt also carries `attempts` (who
// failed, why, who answered).
//
// Every attempt is counted per backend (daily + monthly) so the Web tab can
// show how much of each free quota the box is burning — there is no API to
// ask providers what is left, so the tally is kept locally.

import { getSetting, setSetting, getDb } from '../db/index.js';
import { decodeEntities, stripTags } from '../lib/html.js';

export type WebSearchBackend = 'duckduckgo' | 'searxng' | 'tavily' | 'brave' | 'exa' | 'tinyfish';

export const WEB_SEARCH_BACKEND_KEY = 'web_search_backend';
export const WEB_SEARCH_BASE_URL_KEY = 'web_search_base_url';
// One key slot per keyed backend — each is a separate free-tier account, and
// the Keys page edits them side by side (settings.web_search_api_key from the
// first cut was a single shared slot; never released, dropped without a
// migration).
export const WEB_SEARCH_TAVILY_KEY = 'web_search_tavily_key';
export const WEB_SEARCH_BRAVE_KEY = 'web_search_brave_key';
export const WEB_SEARCH_EXA_KEY = 'web_search_exa_key';
// One TinyFish key is account-wide: it powers the search backend AND the
// /v1/fetch reader chain — hence the name outside the web_search_* prefix.
export const TINYFISH_API_KEY = 'tinyfish_api_key';
// Local tally of search attempts per backend — providers expose no "quota
// left" API, so the Web tab shows these counts against the published free
// tiers. One JSON blob; daily/monthly buckets roll over on read.
const WEB_SEARCH_USAGE_KEY = 'web_search_usage';

const VALID_BACKENDS: readonly string[] = ['duckduckgo', 'searxng', 'tavily', 'brave', 'exa', 'tinyfish'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const SEARCH_TIMEOUT_MS = 15_000;

export interface WebSearchConfig {
  backend: WebSearchBackend;
  /** SearXNG instance base URL; '' when unset. */
  baseUrl: string;
  /** Whether a Tavily/Brave/Exa/TinyFish key is stored — the keys themselves never leave the server. */
  hasTavilyKey: boolean;
  hasBraveKey: boolean;
  hasExaKey: boolean;
  hasTinyfishKey: boolean;
}

function readKey(settingKey: string): string | null {
  const raw = getSetting(settingKey);
  return raw === undefined || raw.trim() === '' ? null : raw;
}

export function getWebSearchConfig(): WebSearchConfig {
  const backendRaw = getSetting(WEB_SEARCH_BACKEND_KEY);
  const baseUrlRaw = getSetting(WEB_SEARCH_BASE_URL_KEY);
  return {
    backend: backendRaw && VALID_BACKENDS.includes(backendRaw) ? backendRaw as WebSearchBackend : 'duckduckgo',
    baseUrl: baseUrlRaw?.trim() ?? '',
    hasTavilyKey: readKey(WEB_SEARCH_TAVILY_KEY) !== null,
    hasBraveKey: readKey(WEB_SEARCH_BRAVE_KEY) !== null,
    hasExaKey: readKey(WEB_SEARCH_EXA_KEY) !== null,
    hasTinyfishKey: readKey(TINYFISH_API_KEY) !== null,
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

export interface WebSearchPatch {
  backend?: WebSearchBackend;
  baseUrl?: string | null;
  tavilyKey?: string | null;
  braveKey?: string | null;
  exaKey?: string | null;
  tinyfishKey?: string | null;
}

// Partial update; null/empty clears the stored value (mirrors the complexity
// gate's write-only key handling in services/complexity-gate.ts).
export function setWebSearchConfig(patch: WebSearchPatch): void {
  if (patch.backend !== undefined) {
    if (!VALID_BACKENDS.includes(patch.backend)) {
      throw new Error(`Unknown web search backend: ${patch.backend}`);
    }
    setSetting(WEB_SEARCH_BACKEND_KEY, patch.backend);
  }
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

// ── DuckDuckGo (default, keyless) ───────────────────────────────────────────

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

// ── SearXNG (self-host, keyless) ────────────────────────────────────────────

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

async function searchSearxng(cfg: WebSearchConfig, query: string, maxResults: number): Promise<WebSearchResult[]> {
  const base = cfg.baseUrl.replace(/\/+$/, '');
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

// ── Tavily (free-tier key: 1,000 searches/month, no card) ──────────────────

async function searchTavily(query: string, maxResults: number): Promise<WebSearchResult[]> {
  const key = readKey(WEB_SEARCH_TAVILY_KEY);
  if (!key) throw new Error('Tavily backend needs a free API key (Keys page → Search providers)');
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': UA },
    body: JSON.stringify({ api_key: key, query, max_results: maxResults }),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Tavily responded ${res.status}`);
  const data = await res.json() as { results?: Array<{ title?: string; url?: string; content?: string }> };
  return mapHits((data.results ?? []).map(r => ({ title: r.title, url: r.url, snippet: r.content })), maxResults);
}

// ── Brave (free-tier key: 2,000 queries/month, no card) ────────────────────

async function searchBrave(query: string, maxResults: number): Promise<WebSearchResult[]> {
  const key = readKey(WEB_SEARCH_BRAVE_KEY);
  if (!key) throw new Error('Brave backend needs a free API key (Keys page → Search providers)');
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`, {
    headers: { 'x-subscription-token': key, accept: 'application/json', 'user-agent': UA },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Brave responded ${res.status}`);
  const data = await res.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
  return mapHits((data.web?.results ?? []).map(r => ({ title: r.title, url: r.url, snippet: r.description })), maxResults);
}

// ── Exa (free tier: $10 credits/month, no card) ────────────────────────────

async function searchExa(query: string, maxResults: number): Promise<WebSearchResult[]> {
  const key = readKey(WEB_SEARCH_EXA_KEY);
  if (!key) throw new Error('Exa backend needs a free API key (Keys page → Web search)');
  const res = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: { 'x-api-key': key, 'content-type': 'application/json', 'user-agent': UA },
    body: JSON.stringify({ query, numResults: maxResults, contents: { highlights: true } }),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Exa responded ${res.status}`);
  const data = await res.json() as { results?: Array<{ title?: string | null; url?: string; text?: string | null; highlights?: string[] | null }> };
  return mapHits(
    (data.results ?? []).map(r => ({
      title: r.title ?? undefined,
      url: r.url,
      snippet: r.highlights?.join(' ') || r.text || '',
    })),
    maxResults,
  );
}

// ── TinyFish (free: Search 12k req/day, key also powers /v1/fetch) ─────────

async function searchTinyfish(query: string, maxResults: number): Promise<WebSearchResult[]> {
  const key = getTinyfishApiKey();
  if (!key) throw new Error('TinyFish backend needs a free API key (Keys page → Web search)');
  const params = new URLSearchParams({ query });
  const res = await fetch(`https://api.search.tinyfish.ai?${params.toString()}`, {
    headers: { 'x-api-key': key, accept: 'application/json', 'user-agent': UA },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`TinyFish responded ${res.status}`);
  const data = await res.json() as { results?: Array<{ title?: string; url?: string; snippet?: string }> };
  return mapHits(data.results ?? [], maxResults);
}

// ── Orchestration ───────────────────────────────────────────────────────────

async function runBackendFor(backend: WebSearchBackend, cfg: WebSearchConfig, query: string, maxResults: number): Promise<WebSearchResult[]> {
  switch (backend) {
    case 'searxng': return searchSearxng(cfg, query, maxResults);
    case 'tavily': return searchTavily(query, maxResults);
    case 'brave': return searchBrave(query, maxResults);
    case 'exa': return searchExa(query, maxResults);
    case 'tinyfish': return searchTinyfish(query, maxResults);
    default: return searchDuckduckgo(query, maxResults);
  }
}

// Fallback order after the operator's pick: DuckDuckGo first (keyless, fast —
// the normal failure costs nothing), then the self-hosted instance, then the
// keyed backends from the largest free quota to the smallest so a burst of
// fallback traffic lands on TinyFish's 12k/day before Tavily's 1k/month.
// Backends that can only fail (no key, no URL) are skipped outright.
const FALLBACK_ORDER: readonly WebSearchBackend[] = ['duckduckgo', 'searxng', 'tinyfish', 'exa', 'brave', 'tavily'];

function buildChain(cfg: WebSearchConfig): WebSearchBackend[] {
  const hasKey: Partial<Record<WebSearchBackend, boolean>> = {
    tavily: cfg.hasTavilyKey,
    brave: cfg.hasBraveKey,
    exa: cfg.hasExaKey,
    tinyfish: cfg.hasTinyfishKey,
  };
  const chain: WebSearchBackend[] = [cfg.backend];
  for (const backend of FALLBACK_ORDER) {
    if (chain.includes(backend)) continue;
    if (backend === 'searxng' && !cfg.baseUrl) continue;
    if (backend in hasKey && !hasKey[backend]) continue;
    chain.push(backend);
  }
  return chain;
}

export interface WebSearchAttempt {
  backend: WebSearchBackend;
  ok: boolean;
  /** Failure message; absent on success. */
  error?: string;
}

// Total wall-clock budget for one search across the whole chain. Without it a
// fully dead network would stack every backend's own 15s timeout (~90s) before
// the 502; with it the request gives up at ~25s and reports what it tried.
const CHAIN_BUDGET_MS = 25_000;

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`gave up after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

/**
 * Try the configured backend, then the fallback chain, until one answers —
 * in one 25s budget. The response `provider` is whichever backend actually
 * served; `attempts` (present only when it took more than one) records who
 * failed and why. When every candidate errors (or the budget runs out), the
 * thrown message joins them all so the route's 502 keeps the first cause
 * visible and names anything left untried.
 */
export async function searchWeb(
  query: string,
  maxResults: number,
): Promise<{ provider: WebSearchBackend; results: WebSearchResult[]; attempts?: WebSearchAttempt[] }> {
  const cfg = getWebSearchConfig();
  const chain = buildChain(cfg);
  const attempts: WebSearchAttempt[] = [];
  const errors: string[] = [];
  const start = Date.now();
  for (const backend of chain) {
    const remaining = CHAIN_BUDGET_MS - (Date.now() - start);
    if (remaining <= 0) {
      const untried = chain.slice(chain.indexOf(backend)).join(', ');
      errors.push(`chain budget of ${CHAIN_BUDGET_MS}ms exhausted, untried: ${untried}`);
      break;
    }
    recordWebSearchAttempt(backend);
    try {
      const results = await withDeadline(runBackendFor(backend, cfg, query, maxResults), remaining);
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
