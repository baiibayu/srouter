import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../app.js';
import { initDb, getDb, getUnifiedApiKey, setSetting } from '../../db/index.js';
import { encrypt } from '../../lib/crypto.js';
import { clearAllCooldowns } from '../../services/ratelimit.js';
import { mintDashboardToken } from '../helpers/auth.js';
import { seedSearchEngines } from '../helpers/search-engines.js';
import { updateSearchEngine, listSearchEngines } from '../../services/search.js';
import { WEB_SEARCH_TAVILY_KEY, WEB_SEARCH_EXA_KEY } from '../../services/web-search.js';

// HTTP surface of web search (#1174): POST /v1/search and GET
// /v1/search/engines for API callers, /api/search/engines and
// /api/analytics/search for the dashboard, and the 'search' kind on the
// provider checklist.

const realFetch = globalThis.fetch;
let dashToken = '';

function _addKey(platform: string): number {
  const { encrypted, iv, authTag } = encrypt(`${platform}-key`);
  const row = getDb().prepare(`
    INSERT INTO api_keys (platform, label, encrypted_key, iv, auth_tag, status, enabled)
    VALUES (?, 'test', ?, ?, ?, 'healthy', 1)
  `).run(platform, encrypted, iv, authTag);
  return Number(row.lastInsertRowid);
}

async function call(app: Express, method: string, path: string, opts: { body?: unknown; auth?: 'dash' | 'api' | null } = {}) {
  const server = app.listen(0, '127.0.0.1');
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const addr = server.address() as any;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const auth = opts.auth === undefined ? (path.startsWith('/api') ? 'dash' : 'api') : opts.auth;
  if (auth === 'dash') headers.Authorization = `Bearer ${dashToken}`;
  if (auth === 'api') headers.Authorization = `Bearer ${getUnifiedApiKey()}`;
  const res = await realFetch(`http://127.0.0.1:${addr.port}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const body = await res.json().catch(() => null);
  server.close();
  return { status: res.status, body, headers: res.headers };
}

function mockUpstream(handler: (url: string) => Response) {
  globalThis.fetch = vi.fn((url: string) => Promise.resolve(handler(String(url)))) as unknown as typeof fetch;
}

describe('search routes', () => {
  let app: Express;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    seedSearchEngines();
    // The keyed chain runs ahead of the keyless fallback. Parallel is keyless
    // and enabled by default, so it eats the first hop in every keyed test and
    // returns 502 when the mock doesn't speak its MCP URL. Disable it (and
    // DuckDuckGo) so the chain is the catalog engines the tests add keys for.
    for (const e of [listSearchEngines()].flat()) {
      if (e.platform === 'parallel' || e.platform === 'duckduckgo') {
        updateSearchEngine(e.id, { enabled: false });
      }
    }
    clearAllCooldowns(Number.MAX_SAFE_INTEGER);
    app = createApp();
    dashToken = mintDashboardToken();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('POST /v1/search requires the gateway key', async () => {
    const { status } = await call(app, 'POST', '/v1/search', { body: { query: 'q' }, auth: null });
    expect(status).toBe(401);
  });

  const DDG_FIXTURE = `<html><body><div class="result">
  <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage&amp;rut=abc">Example <b>Title</b></a>
  <a class="result__snippet" href="https://example.com/page">A snippet with &amp; entities</a>
</div></body></html>`;

  it('POST /v1/search returns a 503 only when the keyless fallback fails too', async () => {
    // No keys: the DuckDuckGo walker is attempted first; stub it dead (offline).
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network down'))) as unknown as typeof fetch;
    const { status, body } = await call(app, 'POST', '/v1/search', { body: { query: 'q' } });
    expect(status).toBe(503);
    expect(body.error.code).toBe('no_search_keys');
  });

  it('POST /v1/search answers without any key via the keyless fallback', async () => {
    globalThis.fetch = vi.fn((url: string) => Promise.resolve(
      String(url).includes('duckduckgo')
        ? new Response(DDG_FIXTURE, { status: 200, headers: { 'content-type': 'text/html' } })
        : new Response('not found', { status: 500 }),
    )) as unknown as typeof fetch;
    const { status, body } = await call(app, 'POST', '/v1/search', { body: { query: 'q' } });
    expect(status).toBe(200);
    expect(body).toEqual({
      query: 'q',
      provider: 'duckduckgo',
      engine: 'duckduckgo',
      results: [{ title: 'Example Title', url: 'https://example.com/page', content: 'A snippet with & entities', score: 1 }],
    });
  });

  it('POST /v1/search serves hits with provider and engine', async () => {
    setSetting(WEB_SEARCH_TAVILY_KEY, 'tavily-key');
    mockUpstream(() => new Response(JSON.stringify({ results: [{ title: 'T', url: 'https://t', content: 'c', score: 0.5 }] }), { status: 200 }));
    const { status, body } = await call(app, 'POST', '/v1/search', { body: { query: 'q', max_results: 2 } });
    expect(status).toBe(200);
    expect(body).toEqual({
      query: 'q',
      results: [{ title: 'T', url: 'https://t', content: 'c', score: 0.5 }],
      provider: 'tavily',
      engine: 'tavily-search',
    });
  });

  it('POST /v1/search forwards Retry-After when every engine is rate limited', async () => {
    setSetting(WEB_SEARCH_TAVILY_KEY, 'tavily-key');
    mockUpstream(() => new Response('{}', { status: 429, headers: { 'retry-after': '7' } }));
    const { status, headers, body } = await call(app, 'POST', '/v1/search', { body: { query: 'q' } });
    expect(status).toBe(429);
    expect(headers.get('retry-after')).toBe('7');
    expect(body.error.type).toBe('rate_limit_error');
  });

  it('GET /v1/search/engines lists the enabled engines and whether each is usable', async () => {
    setSetting(WEB_SEARCH_EXA_KEY, 'exa-key');
    const { status, body } = await call(app, 'GET', '/v1/search/engines');
    expect(status).toBe(200);
    expect(body.data.map((e: any) => e.id)).toEqual([
      'tinyfish-search', 'exa-search', 'brave-search',
      'tavily-search', 'firecrawl-search', 'linkup-search',
    ]);
    expect(body.data.find((e: any) => e.id === 'exa-search').available).toBe(true);
    expect(body.data.find((e: any) => e.id === 'tavily-search').available).toBe(false);
  });

  it('GET/PATCH /api/search/engines lists, reorders and toggles engines', async () => {
    const list = await call(app, 'GET', '/api/search/engines');
    expect(list.status).toBe(200);
    expect(list.body[0]).toMatchObject({ engineId: 'duckduckgo-search', priority: 0, enabled: false, keyCount: 0, isCustom: false, keyless: true });
    const firecrawl = list.body.find((e: any) => e.engineId === 'firecrawl-search');

    const moved = await call(app, 'PATCH', `/api/search/engines/${firecrawl.id}`, { body: { priority: 0, enabled: false } });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ engineId: 'firecrawl-search', priority: 0, enabled: false });

    const bad = await call(app, 'PATCH', `/api/search/engines/${firecrawl.id}`, { body: {} });
    expect(bad.status).toBe(400);
    const missing = await call(app, 'PATCH', '/api/search/engines/999999', { body: { enabled: true } });
    expect(missing.status).toBe(404);
  });

  it('GET /api/analytics/search returns the search summary', async () => {
    getDb().prepare(`INSERT INTO search_requests (engine_id, platform, status, latency_ms, result_count) VALUES ('exa-search', 'exa', 'ok', 300, 5)`).run();
    const { status, body } = await call(app, 'GET', '/api/analytics/search?range=30d');
    expect(status).toBe(200);
    expect(body).toMatchObject({ total: 1, successRate: 100, avgLatencyMs: 300 });
    expect(body.byEngine).toEqual([{ engineId: 'exa-search', displayName: 'Exa Search', count: 1 }]);
  });

  it('marks search platforms on the provider checklist and keeps engines off the media list', async () => {
    const providers = await call(app, 'GET', '/api/keys/providers');
    const kinds = Object.fromEntries(providers.body.providers.map((p: any) => [p.platform, p.kind]));
    expect(kinds).toMatchObject({ tavily: 'search', exa: 'search', firecrawl: 'search', linkup: 'search', groq: 'chat' });

    const media = await call(app, 'GET', '/api/media');
    expect(media.body.models.some((m: any) => m.modality === 'search')).toBe(false);
  });

  it('registers a custom search relay through POST /api/media/custom', async () => {
    const created = await call(app, 'POST', '/api/media/custom', {
      body: { baseUrl: 'https://search.example.com', model: 'my-searxng', modality: 'search', apiKey: 'k' },
    });
    expect(created.status).toBe(201);
    const engines = await call(app, 'GET', '/api/search/engines');
    expect(engines.body.find((e: any) => e.engineId === 'my-searxng')).toMatchObject({ isCustom: true, keyCount: 1 });
  });
});
