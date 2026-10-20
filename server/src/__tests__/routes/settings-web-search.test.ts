import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../app.js';
import { initDb, getSetting } from '../../db/index.js';
import { mintDashboardToken } from '../helpers/auth.js';
import {
  getWebSearchConfig, setWebSearchConfig,
  WEB_SEARCH_BASE_URL_KEY, WEB_SEARCH_TAVILY_KEY, WEB_SEARCH_BRAVE_KEY,
  WEB_SEARCH_EXA_KEY, TINYFISH_API_KEY, WEB_SEARCH_FIRECRAWL_KEY, WEB_SEARCH_LINKUP_KEY,
} from '../../services/web-search.js';

async function request(app: Express, method: string, path: string, body: any, token: string) {
  const server = app.listen(0, '127.0.0.1');
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const addr = server.address() as any;
  const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await res.text();
  server.close();
  let json: any = null;
  try { json = JSON.parse(raw); } catch {}
  return { status: res.status, body: json };
}

// GET/PUT /api/settings/web-search: the operator picks the POST /v1/web-search
// backend (keyless-first: DuckDuckGo default, SearXNG, Tavily, Brave, Exa,
// TinyFish). The keys are edited on the Keys page, write-only over the wire —
// GET reports only presence. The TinyFish key is shared with /v1/fetch.
describe('/api/settings/web-search', () => {
  let app: Express;
  let token: string;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    app = createApp();
    token = mintDashboardToken();
  });

  afterEach(() => {
    setWebSearchConfig({
      baseUrl: null,
      tavilyKey: null, braveKey: null, exaKey: null, tinyfishKey: null,
      firecrawlKey: null, linkupKey: null,
    });
  });

  it('reports the defaults (duckduckgo, no URL, no keys)', async () => {
    const { status, body } = await request(app, 'GET', '/api/settings/web-search', undefined, token);
    expect(status).toBe(200);
    expect(body).toEqual({
      baseUrl: '',
      hasTavilyKey: false, hasBraveKey: false, hasExaKey: false, hasTinyfishKey: false,
      hasFirecrawlKey: false, hasLinkupKey: false,
      usage: { daily: {}, monthly: {} },
    });
  });

  it('stores and returns a partial update', async () => {
    const put = await request(app, 'PUT', '/api/settings/web-search', { baseUrl: 'http://localhost:8888' }, token);
    expect(put.status).toBe(200);
    expect(put.body.baseUrl).toBe('http://localhost:8888');
    expect(getSetting(WEB_SEARCH_BASE_URL_KEY)).toBe('http://localhost:8888');

    const get = await request(app, 'GET', '/api/settings/web-search', undefined, token);
    expect(get.body).toEqual(put.body);
  });

  it('keys are write-only and stored per backend: set shows presence, GET never echoes', async () => {
    const put = await request(app, 'PUT', '/api/settings/web-search', { tavilyKey: 'tvly-secret' }, token);
    expect(put.status).toBe(200);
    expect(put.body.hasTavilyKey).toBe(true);
    expect(put.body.hasBraveKey).toBe(false);
    expect(put.body.tavilyKey).toBeUndefined();
    expect(getSetting(WEB_SEARCH_TAVILY_KEY)).toBe('tvly-secret');

    const get = await request(app, 'GET', '/api/settings/web-search', undefined, token);
    expect(get.body.tavilyKey).toBeUndefined();
    expect(get.body.hasTavilyKey).toBe(true);

    // The Brave slot is independent — a Brave key never overwrites Tavily's.
    const brave = await request(app, 'PUT', '/api/settings/web-search', { braveKey: 'br-secret' }, token);
    expect(brave.body.hasTavilyKey).toBe(true);
    expect(brave.body.hasBraveKey).toBe(true);
    expect(getSetting(WEB_SEARCH_TAVILY_KEY)).toBe('tvly-secret');
    expect(getSetting(WEB_SEARCH_BRAVE_KEY)).toBe('br-secret');

    const clear = await request(app, 'PUT', '/api/settings/web-search', { tavilyKey: null, braveKey: null }, token);
    expect(clear.status).toBe(200);
    expect(clear.body.hasTavilyKey).toBe(false);
    expect(clear.body.hasBraveKey).toBe(false);
    expect(getSetting(WEB_SEARCH_TAVILY_KEY)).toBeUndefined();
    expect(getSetting(WEB_SEARCH_BRAVE_KEY)).toBeUndefined();
  });

  it('stores the Exa and TinyFish keys in their own slots (write-only)', async () => {
    const put = await request(app, 'PUT', '/api/settings/web-search', { backend: 'exa', exaKey: 'ex-secret', tinyfishKey: 'tf-secret' }, token);
    expect(put.status).toBe(200);
    expect(put.body.hasExaKey).toBe(true);
    expect(put.body.hasTinyfishKey).toBe(true);
    expect(put.body.exaKey).toBeUndefined();
    expect(put.body.tinyfishKey).toBeUndefined();
    expect(getSetting(WEB_SEARCH_EXA_KEY)).toBe('ex-secret');
    expect(getSetting(TINYFISH_API_KEY)).toBe('tf-secret');

    const clear = await request(app, 'PUT', '/api/settings/web-search', { exaKey: null, tinyfishKey: null }, token);
    expect(clear.body.hasExaKey).toBe(false);
    expect(clear.body.hasTinyfishKey).toBe(false);
    expect(getSetting(WEB_SEARCH_EXA_KEY)).toBeUndefined();
    expect(getSetting(TINYFISH_API_KEY)).toBeUndefined();
  });

  it('stores the Firecrawl and Linkup slots in their own slots (write-only)', async () => {
    const put = await request(app, 'PUT', '/api/settings/web-search', { firecrawlKey: 'fc-secret', linkupKey: 'lk-secret' }, token);
    expect(put.status).toBe(200);
    expect(put.body.hasFirecrawlKey).toBe(true);
    expect(put.body.hasLinkupKey).toBe(true);
    expect(put.body.firecrawlKey).toBeUndefined();
    expect(put.body.linkupKey).toBeUndefined();
    expect(getSetting(WEB_SEARCH_FIRECRAWL_KEY)).toBe('fc-secret');
    expect(getSetting(WEB_SEARCH_LINKUP_KEY)).toBe('lk-secret');

    const clear = await request(app, 'PUT', '/api/settings/web-search', { firecrawlKey: null, linkupKey: null }, token);
    expect(clear.body.hasFirecrawlKey).toBe(false);
    expect(clear.body.hasLinkupKey).toBe(false);
    expect(getSetting(WEB_SEARCH_FIRECRAWL_KEY)).toBeUndefined();
    expect(getSetting(WEB_SEARCH_LINKUP_KEY)).toBeUndefined();
  });

  it('rejects invalid configs', async () => {
    for (const bad of [
      { baseUrl: 'not-a-url' },
      { tavilyKey: 42 },
      { tinyfishKey: 42 },
    ]) {
      const { status } = await request(app, 'PUT', '/api/settings/web-search', bad, token);
      expect(status).toBe(400);
    }
    // state untouched by the rejections
    expect(getWebSearchConfig().baseUrl).toBe('');
  });

  it('requires auth', async () => {
    const { status } = await request(app, 'GET', '/api/settings/web-search', undefined, 'bad-token');
    expect(status).toBe(401);
  });
});
