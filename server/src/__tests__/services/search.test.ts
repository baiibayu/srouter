import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initDb, getDb } from '../../db/index.js';
import { encrypt } from '../../lib/crypto.js';
import { clearAllCooldowns } from '../../services/ratelimit.js';
import {
  runSearch,
  listSearchEngines,
  updateSearchEngine,
  searchAvailable,
} from '../../services/search.js';
import { SEARCH_PLATFORMS as SHARED_SEARCH_PLATFORMS } from '../../../../shared/types.js';
import { SEARCH_PLATFORMS } from '../../lib/search-platforms.js';
import { seedSearchEngines } from '../helpers/search-engines.js';

const realFetch = globalThis.fetch;

function addKey(platform: string, raw = `${platform}-test-key`): number {
  const keyMap: Record<string, string> = {
    'tavily': 'web_search_tavily_key',
    'exa': 'web_search_exa_key',
    'firecrawl': 'web_search_firecrawl_key',
    'linkup': 'web_search_linkup_key',
    'brave': 'web_search_brave_key',
    'tinyfish': 'tinyfish_api_key',
  };
  const settingKey = keyMap[platform];
  if (settingKey) {
    getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(settingKey, raw);
    return 0;
  }
  const { encrypted, iv, authTag } = encrypt(raw);
  const row = getDb().prepare(`
    INSERT INTO api_keys (platform, label, encrypted_key, iv, auth_tag, status, enabled)
    VALUES (?, 'test', ?, ?, ?, 'healthy', 1)
  `).run(platform, encrypted, iv, authTag);
  return Number(row.lastInsertRowid);
}

function addCustomRelay(baseUrl: string, engineId = 'my-relay'): number {
  const { encrypted, iv, authTag } = encrypt('relay-key');
  const key = getDb().prepare(`
    INSERT INTO api_keys (platform, label, encrypted_key, iv, auth_tag, status, enabled, base_url)
    VALUES ('custom', 'relay', ?, ?, ?, 'healthy', 1, ?)
  `).run(encrypted, iv, authTag, baseUrl);
  const keyId = Number(key.lastInsertRowid);
  getDb().prepare(`
    INSERT INTO media_models (platform, model_id, display_name, modality, priority, enabled, quota_label, key_id)
    VALUES ('custom', ?, ?, 'search', 99, 1, 'custom endpoint', ?)
  `).run(engineId, engineId, keyId);
  return keyId;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

type Call = [string, RequestInit];
function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn((url: string, init: RequestInit) => Promise.resolve(handler(url, init)));
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}
const calls = (fn: ReturnType<typeof mockFetch>) => fn.mock.calls as unknown as Call[];

describe('search platforms', () => {
  it('server runtime list matches the shared list', () => {
    expect([...SEARCH_PLATFORMS]).toEqual([...SHARED_SEARCH_PLATFORMS]);
  });
});

describe('search service', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    seedSearchEngines();
    clearAllCooldowns(Number.MAX_SAFE_INTEGER);
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('lists all nine engines in priority order', () => {
    expect(listSearchEngines().map(e => e.engineId)).toEqual([
      'duckduckgo-search', 'parallel-search', 'searxng-search', 'tinyfish-search', 'exa-search',
      'brave-search', 'tavily-search', 'firecrawl-search', 'linkup-search',
    ]);
    expect(searchAvailable()).toBe(true);
  });

  it('flags the keyless engines and configured status correctly', () => {
    const engines = listSearchEngines();
    const map = new Map(engines.map(e => [e.engineId, { keyless: e.keyless, configured: e.configured }]));
    expect(map.get('duckduckgo-search')).toEqual({ keyless: true, configured: true });
    expect(map.get('parallel-search')).toEqual({ keyless: true, configured: true });
    expect(map.get('searxng-search')).toEqual({ keyless: false, configured: false });
    expect(map.get('tinyfish-search')).toEqual({ keyless: false, configured: false });
    expect(map.get('tavily-search')).toEqual({ keyless: false, configured: false });
    addKey('tavily');
    expect(listSearchEngines().find(e => e.engineId === 'tavily-search')?.configured).toBe(true);
  });

  it('answers 503 no_search_keys when no engine has a key and the keyless fallback fails too', async () => {
    mockFetch(() => { throw new Error('network down'); });
    await expect(runSearch('q')).rejects.toMatchObject({ status: 502 });
  });

  it('skips engines without keys and maps Exa hits', async () => {
    addKey('exa');
    const fn = mockFetch(() => json({
      results: [
        { title: 'A', url: 'https://a', text: 'alpha' },
        { title: 'B', url: 'https://b', text: 'beta' },
      ],
    }));
    const out = await runSearch('what', { topic: 'news', maxResults: 2, engine: 'exa-search' });
    expect(calls(fn)).toHaveLength(1);
    expect(calls(fn)[0][0]).toBe('https://api.exa.ai/search');
    expect(out).toMatchObject({ provider: 'exa', engine: 'exa-search' });
    expect(out.results).toEqual([
      { title: 'A', url: 'https://a', content: 'alpha', score: 1 },
      { title: 'B', url: 'https://b', content: 'beta', score: 0.5 },
    ]);
  });

  it('passes Tavily topic/answer through and keeps its scores', async () => {
    addKey('tavily');
    const fn = mockFetch(() => json({ answer: '42', results: [{ title: 'T', url: 'https://t', content: 'c', score: 0.83 }] }));
    const out = await runSearch('q', { includeAnswer: true, topic: 'general', engine: 'tavily-search' });
    expect(calls(fn)[0][0]).toBe('https://api.tavily.com/search');
    expect(out.answer).toBe('42');
    expect(out.results[0].score).toBe(0.83);
  });

  it('maps Firecrawl news hits and Linkup sourced answers', async () => {
    addKey('firecrawl');
    let _fn = mockFetch(() => json({ success: true, data: { news: [{ title: 'N', url: 'https://n', snippet: 'fresh' }] } }));
    let out = await runSearch('q', { topic: 'news' });
    expect(out.results).toEqual([{ title: 'N', url: 'https://n', content: 'fresh', score: 1 }]);

    updateSearchEngine(listSearchEngines().find(e => e.engineId === 'firecrawl-search')!.id, { enabled: false });
    addKey('linkup');
    _fn = mockFetch(() => json({ answer: 'yes', sources: [{ name: 'S', url: 'https://s', snippet: 'src' }] }));
    out = await runSearch('q', { includeAnswer: true });
    expect(out).toMatchObject({ answer: 'yes', provider: 'linkup', results: [{ title: 'S', url: 'https://s', content: 'src' }] });
  });

  describe('Parallel', () => {
    const mcpReply = (payload: unknown) => ({
      jsonrpc: '2.0',
      id: 1,
      result: { content: [{ type: 'text', text: JSON.stringify(payload) }] },
    });
    const hits = { results: [
      { url: 'https://a', title: 'A &amp; B', excerpts: ['one', 'two'] },
      { url: 'https://b', title: null, excerpts: [] },
    ] };

    it('searches anonymously over MCP with the stored sentinel', async () => {
      const fn = mockFetch(() => json(mcpReply(hits)));
      const out = await runSearch('node version');
      expect(calls(fn)[0][0]).toBe('https://search.parallel.ai/mcp');
      expect(out).toMatchObject({ provider: 'parallel', engine: 'parallel-search' });
      expect(out.results).toEqual([
        { title: 'A & B', url: 'https://a', content: 'one … two', score: 1 },
        { title: 'https://b', url: 'https://b', content: '', score: 0.5 },
      ]);
    });
  });

  it('tries a custom relay before the catalog engines', async () => {
    addKey('tavily');
    addCustomRelay('https://relay.example/v1');
    const fn = mockFetch(url => url.startsWith('https://relay.example')
      ? json({ error: 'down' }, 500)
      : json({ results: [{ title: 'T', url: 'https://t', content: 'c', score: 1 }] }));
    const out = await runSearch('q');
    expect(calls(fn).map(c => c[0])).toEqual(['https://relay.example/v1/search', 'https://search.parallel.ai/mcp', 'https://api.tavily.com/search']);
    expect(out.provider).toBe('tavily');
  });

  it('cools a rate-limited key down and fails over', async () => {
    addKey('tavily');
    addKey('exa');
    const _fn = mockFetch(url => url.includes('exa')
      ? json({ detail: 'slow down' }, 429, { 'retry-after': '120' })
      : json({ results: [{ title: 'E', url: 'https://e', text: 'x' }] }));
    expect((await runSearch('q')).provider).toBe('tavily');
  });

  it('pins an engine by id and rejects unknown or disabled ones', async () => {
    addKey('tavily');
    addKey('exa');
    const _fn = mockFetch(() => json({ results: [{ title: 'E', url: 'https://e', text: 'x' }] }));
    expect((await runSearch('q', { engine: 'exa-search' })).engine).toBe('exa-search');
    await expect(runSearch('q', { engine: 'nope' })).rejects.toMatchObject({ status: 400 });
  });

  it('reorders engines locally and lists key and usage counts', async () => {
    addKey('linkup');
    const linkup = listSearchEngines().find(e => e.engineId === 'linkup-search')!;
    expect(updateSearchEngine(linkup.id, { priority: 0 })).toBe(true);
    const order = listSearchEngines();
    expect(order[0].engineId).toBe('linkup-search');
  });
});
