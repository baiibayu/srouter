import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../app.js';
import { initDb, getUnifiedApiKey } from '../../db/index.js';
import { htmlToText, assertPublicHttpUrl } from '../../routes/tools.js';
import { parseDdgHtml, setWebSearchConfig } from '../../services/web-search.js';
import { getFetchUsage } from '../../services/fetch-usage.js';
import { mintDashboardToken } from '../helpers/auth.js';

// The helper ALWAYS talks to the local server through the real fetch: several
// tests stub globalThis.fetch for the outbound (DDG/Jina) call, and a stubbed
// helper fetch would both break the assertion and leak the listen handle.
const realFetch = globalThis.fetch.bind(globalThis);

async function post(app: Express, path: string, body: any, token?: string) {
  const server = app.listen(0, '127.0.0.1');
  try {
    if (!server.listening) await new Promise<void>(resolve => server.once('listening', () => resolve()));
    const addr = server.address() as any;
    const res = await realFetch(`http://127.0.0.1:${addr.port}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    let json: any = null;
    try { json = JSON.parse(raw); } catch {}
    return { status: res.status, body: json, raw };
  } finally {
    server.close();
  }
}

async function get(app: Express, path: string, token?: string) {
  const server = app.listen(0, '127.0.0.1');
  try {
    if (!server.listening) await new Promise<void>(resolve => server.once('listening', () => resolve()));
    const addr = server.address() as any;
    const res = await realFetch(`http://127.0.0.1:${addr.port}${path}`, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const raw = await res.text();
    let json: any = null;
    try { json = JSON.parse(raw); } catch {}
    return { status: res.status, body: json, raw };
  } finally {
    server.close();
  }
}

const DDG_FIXTURE = `
<html><body>
<div class="result">
  <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage&amp;rut=abc">Example <b>Title</b></a>
  <a class="result__snippet" href="https://example.com/page">A snippet with &amp; entities</a>
</div>
<div class="result">
  <a class="result__a" href="https://direct.example.org/x">Second result</a>
  <td class="result__snippet">Second snippet</td>
</div>
</body></html>`;

describe('parseDdgHtml', () => {
  it('extracts titles, resolved URLs and snippets in order', () => {
    const results = parseDdgHtml(DDG_FIXTURE);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      title: 'Example Title',
      url: 'https://example.com/page',
      snippet: 'A snippet with & entities',
    });
    expect(results[1]).toEqual({
      title: 'Second result',
      url: 'https://direct.example.org/x',
      snippet: 'Second snippet',
    });
  });

  it('returns [] on a captcha/rate page (no result__a anchors)', () => {
    expect(parseDdgHtml('<html><body>anomaly-missions</body></html>')).toEqual([]);
  });
});

describe('htmlToText', () => {
  it('pulls the title and body text, dropping scripts/styles', () => {
    const html = `<html><head><title>My Page</title><style>.x{}</style></head>
      <body><script>alert(1)</script><h1>Head</h1><p>Hello &amp; world</p><li>one</li></body></html>`;
    const { title, text } = htmlToText(html);
    expect(title).toBe('My Page');
    expect(text).toContain('Head');
    expect(text).toContain('Hello & world');
    expect(text).toContain('- one');
    expect(text).not.toContain('alert(1)');
    expect(text).not.toContain('.x{}');
  });
});

describe('assertPublicHttpUrl (SSRF guard)', () => {
  const blocked = [
    'http://127.0.0.1/admin',
    'http://localhost:20268/api/keys',
    'http://[::1]/',
    'http://192.168.1.1/',
    'http://10.0.0.5/',
    'http://172.16.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://100.64.0.1/',
    'http://foo.local/',
    'http://metadata.google.internal/',
    'ftp://example.com/file',
    'file:///C:/Windows/System32/',
    'not a url',
  ];
  it.each(blocked)('blocks %s', async (url) => {
    await expect(assertPublicHttpUrl(url)).rejects.toThrow();
  });

  it('allows a public literal address', async () => {
    const url = await assertPublicHttpUrl('http://93.184.216.34/page');
    expect(url.hostname).toBe('93.184.216.34');
  });
});

describe('/v1/fetch', () => {
  let app: Express;
  let token: string;
  // One session for the whole file: createUser() rejects a second account with
  // the same email, so the dashboard token is minted once and reused.
  let dashToken: string;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    app = createApp();
    // /v1 endpoints authenticate with the unified inference key, not the
    // dashboard session token (same as every other proxy route test).
    token = getUnifiedApiKey();
    dashToken = mintDashboardToken();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // Per-backend keys are shared DB state — every test starts from the default
    // with no keys stored.
    setWebSearchConfig({ tavilyKey: null, braveKey: null, exaKey: null, tinyfishKey: null, firecrawlKey: null, linkupKey: null });
  });

it('fetch blocks private targets BEFORE any network call', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    for (const url of ['http://127.0.0.1:20268/api/health', 'http://192.168.0.1/', 'file:///etc/passwd']) {
      const { status, body } = await post(app, '/v1/fetch', { url }, token);
      expect(status).toBe(400);
      expect(body.error.message).toContain('Fetch blocked');
    }
    expect(spy).not.toHaveBeenCalled();
    // Blocked requests never reached the reader chain — they never count.
    expect(getFetchUsage().monthly).toBe(0);
  });

  it('fetch counts every request that clears the SSRF guard', async () => {
    const before = getFetchUsage();
    const html = '<html><head><title>Counted</title></head><body><p>one</p></body></html>';
    const encoded = new TextEncoder().encode(html);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null) },
      body: undefined,
      arrayBuffer: async () => encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength),
    }));
    const { status } = await post(app, '/v1/fetch', { url: 'http://93.184.216.34/counted' }, token);
    expect(status).toBe(200);
    const after = getFetchUsage();
    expect(after.daily).toBe(before.daily + 1);
    expect(after.monthly).toBe(before.monthly + 1);
  });

  it('GET /api/fetch/usage reports the month and day counters to the dashboard', async () => {
    const before = getFetchUsage();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await post(app, '/v1/fetch', { url: 'http://93.184.216.34/more' }, token);
    const { status, body } = await get(app, '/api/fetch/usage', dashToken);
    expect(status).toBe(200);
    expect(body).toEqual({ monthly: before.monthly + 1, today: before.daily + 1 });
  });

  it('GET /api/fetch/usage requires the dashboard token', async () => {
    const { status } = await get(app, '/api/fetch/usage', 'bad-token');
    expect(status).toBe(401);
  });

  it('fetch validates the body', async () => {
    expect((await post(app, '/v1/fetch', {}, token)).status).toBe(400);
    expect((await post(app, '/v1/fetch', { url: 'x' }, token)).status).toBe(400);
    expect((await post(app, '/v1/fetch', { url: 'http://1.2.3.4/', max_bytes: 1 }, token)).status).toBe(400);
  });

  it('fetch returns extracted text on a direct success', async () => {
    const html = '<html><head><title>T</title></head><body><p>Hello fetch</p></body></html>';
    const encoded = new TextEncoder().encode(html);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null) },
      body: undefined,
      arrayBuffer: async () => encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength),
    }));
    const { status, body } = await post(app, '/v1/fetch', { url: 'http://93.184.216.34/page' }, token);
    expect(status).toBe(200);
    expect(body.via).toBe('direct');
    expect(body.title).toBe('T');
    expect(body.text).toContain('Hello fetch');
    expect(body.truncated).toBe(false);
  });

  it('fetch falls back to the reader when the direct fetch fails', async () => {
    const md = '# Fetched via reader\npage content';
    const encoded = new TextEncoder().encode(md);
    const mock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 403 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        body: undefined,
        arrayBuffer: async () => encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength),
      });
    vi.stubGlobal('fetch', mock);
    const { status, body } = await post(app, '/v1/fetch', { url: 'http://93.184.216.34/blocked' }, token);
    expect(status).toBe(200);
    expect(body.via).toBe('jina');
    expect(body.content_type).toBe('text/markdown');
    expect(body.text).toContain('page content');
    expect(mock).toHaveBeenCalledTimes(2);
    expect(String(mock.mock.calls[1][0])).toContain('r.jina.ai');
  });

  it('fetch uses the TinyFish reader (before Jina) when its key is stored', async () => {
    setWebSearchConfig({ tinyfishKey: 'tf-secret' });
    const mock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 403 }) // direct
      .mockResolvedValueOnce({ // TinyFish answers
        ok: true,
        status: 200,
        json: async () => ({ results: [{ title: 'TF title', text: 'tinyfish markdown content' }] }),
      });
    vi.stubGlobal('fetch', mock);
    const { status, body } = await post(app, '/v1/fetch', { url: 'http://93.184.216.34/js-heavy' }, token);
    expect(status).toBe(200);
    expect(body.via).toBe('tinyfish');
    expect(body.title).toBe('TF title');
    expect(body.text).toContain('tinyfish markdown content');
    expect(mock).toHaveBeenCalledTimes(2);
    expect(String(mock.mock.calls[1][0])).toContain('api.fetch.tinyfish.ai');
    expect(mock.mock.calls[1][1].headers['x-api-key']).toBe('tf-secret');
  });

  it('fetch returns 502 when both the direct fetch and the reader fail', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 403 })
      .mockResolvedValueOnce({ ok: false, status: 500 }));
    const { status, body } = await post(app, '/v1/fetch', { url: 'http://93.184.216.34/x' }, token);
    expect(status).toBe(502);
    expect(body.error.message).toContain('both rejected');
  });

  // The public counterpart of GET /v1/search/engines: the reader registry the
  // dashboard cards show, published over the same inference key.
  it('GET /v1/fetch/sources lists the seeded readers with their configured flag', async () => {
    const { status, body } = await get(app, '/v1/fetch/sources', token);
    expect(status).toBe(200);
    expect(body.object).toBe('list');
    expect(body.data.map((s: any) => s.id)).toEqual(['tinyfish-fetch', 'jina-reader']);
    expect(body.data[0]).toMatchObject({
      object: 'fetch_source',
      provider: 'tinyfish',
      name: 'TinyFish Fetch',
      configured: false,
      quota_label: 'free 1,000 URLs/day · 150 URLs/min',
    });
    // Jina answers anonymously — no key to store, so it is always configured.
    expect(body.data[1]).toMatchObject({ provider: 'jina', configured: true });
    expect(body.data[1].quota_label).toContain('20 RPM');
  });

  it('GET /v1/fetch/sources flips TinyFish to configured once its key is stored', async () => {
    setWebSearchConfig({ tinyfishKey: 'tf-secret' });
    const { body } = await get(app, '/v1/fetch/sources', token);
    expect(body.data.find((s: any) => s.provider === 'tinyfish').configured).toBe(true);
  });

  it('GET /v1/fetch/sources requires the inference key', async () => {
    const { status } = await get(app, '/v1/fetch/sources');
    expect(status).toBe(401);
  });

  it('GET /api/fetch/sources says which reader is preferred and why', async () => {
    const { status, body } = await get(app, '/api/fetch/sources', dashToken);
    expect(status).toBe(200);
    expect(body.preferred).toBe('auto');
    expect(body.usage).toEqual({ monthly: expect.any(Number), today: expect.any(Number) });
    const tinyfish = body.sources.find((s: any) => s.platform === 'tinyfish');
    expect(tinyfish).toMatchObject({ id: 'tinyfish-fetch', enabled: true, configured: false, authKind: 'key' });
    expect(body.sources.find((s: any) => s.platform === 'jina')).toMatchObject({ authKind: 'none', configured: true });
  });

  it('GET /api/fetch/sources requires the dashboard token', async () => {
    const { status } = await get(app, '/api/fetch/sources', 'bad-token');
    expect(status).toBe(401);
  });
});
