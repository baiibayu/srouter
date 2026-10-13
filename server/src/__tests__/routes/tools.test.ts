import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../app.js';
import { initDb, getUnifiedApiKey } from '../../db/index.js';
import { htmlToText, assertPublicHttpUrl } from '../../routes/tools.js';
import { parseDdgHtml, setWebSearchConfig, getWebSearchUsage } from '../../services/web-search.js';

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

describe('/v1/web-search + /v1/fetch', () => {
  let app: Express;
  let token: string;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    app = createApp();
    // /v1 endpoints authenticate with the unified inference key, not the
    // dashboard session token (same as every other proxy route test).
    token = getUnifiedApiKey();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // Backend choice and per-backend keys are shared DB state — every test
    // starts from the default with no keys stored.
    setWebSearchConfig({ backend: 'duckduckgo', baseUrl: null, tavilyKey: null, braveKey: null, exaKey: null, tinyfishKey: null });
  });

  it('rejects missing/invalid API keys on both endpoints', async () => {
    for (const path of ['/v1/web-search', '/v1/fetch']) {
      const noAuth = await post(app, path, { query: 'x' });
      expect(noAuth.status).toBe(401);
      const badAuth = await post(app, path, { query: 'x' }, 'wrong-key');
      expect(badAuth.status).toBe(401);
    }
  });

  it('web-search validates the body', async () => {
    expect((await post(app, '/v1/web-search', {}, token)).status).toBe(400);
    expect((await post(app, '/v1/web-search', { query: '' }, token)).status).toBe(400);
    expect((await post(app, '/v1/web-search', { query: 'x', max_results: 99 }, token)).status).toBe(400);
  });

  it('web-search parses the backend response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => DDG_FIXTURE,
    }));
    const { status, body } = await post(app, '/v1/web-search', { query: 'srouter', max_results: 1 }, token);
    expect(status).toBe(200);
    expect(body.provider).toBe('duckduckgo');
    expect(body.query).toBe('srouter');
    expect(body.results).toHaveLength(1);
    expect(body.results[0].url).toBe('https://example.com/page');
  });

  it('web-search surfaces an empty backend page as 502 (rate limit, not "no answers")', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<html>anomaly</html>',
    }));
    const { status } = await post(app, '/v1/web-search', { query: 'x' }, token);
    expect(status).toBe(502);
  });

  it('web-search runs the configured SearXNG backend (keyless, own instance)', async () => {
    setWebSearchConfig({ backend: 'searxng', baseUrl: 'http://localhost:8888/' });
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [{ url: 'https://example.org/a', title: 'A', content: 'Snippet A' }] }),
    });
    vi.stubGlobal('fetch', mock);
    const { status, body } = await post(app, '/v1/web-search', { query: 'x', max_results: 3 }, token);
    expect(status).toBe(200);
    expect(body.provider).toBe('searxng');
    expect(body.results).toEqual([{ url: 'https://example.org/a', title: 'A', snippet: 'Snippet A' }]);
    const requested = String(mock.mock.calls[0][0]);
    expect(requested).toContain('http://localhost:8888/search');
    expect(requested).toContain('format=json');
  });

  it('web-search runs Tavily with its stored free-tier key', async () => {
    setWebSearchConfig({ backend: 'tavily', tavilyKey: 'tvly-secret' });
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [{ title: 'T', url: 'https://t.example/', content: 'C' }] }),
    });
    vi.stubGlobal('fetch', mock);
    const { status, body } = await post(app, '/v1/web-search', { query: 'x' }, token);
    expect(status).toBe(200);
    expect(body.provider).toBe('tavily');
    expect(body.results[0].url).toBe('https://t.example/');
    expect(String(mock.mock.calls[0][0])).toContain('api.tavily.com');
    expect(JSON.parse(String(mock.mock.calls[0][1].body)).api_key).toBe('tvly-secret');
  });

  it('web-search runs Brave with its stored free-tier key', async () => {
    setWebSearchConfig({ backend: 'brave', braveKey: 'brave-secret' });
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ web: { results: [{ title: 'B', url: 'https://b.example/', description: 'D' }] } }),
    });
    vi.stubGlobal('fetch', mock);
    const { status, body } = await post(app, '/v1/web-search', { query: 'x' }, token);
    expect(status).toBe(200);
    expect(body.provider).toBe('brave');
    expect(body.results[0]).toEqual({ url: 'https://b.example/', title: 'B', snippet: 'D' });
    expect(String(mock.mock.calls[0][0])).toContain('api.search.brave.com');
    expect(mock.mock.calls[0][1].headers['x-subscription-token']).toBe('brave-secret');
  });

  it('web-search runs Exa with its stored free-tier key', async () => {
    setWebSearchConfig({ backend: 'exa', exaKey: 'ex-secret' });
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [{ title: 'E', url: 'https://e.example/', highlights: ['part one', 'part two'] }] }),
    });
    vi.stubGlobal('fetch', mock);
    const { status, body } = await post(app, '/v1/web-search', { query: 'x' }, token);
    expect(status).toBe(200);
    expect(body.provider).toBe('exa');
    expect(body.results[0]).toEqual({ url: 'https://e.example/', title: 'E', snippet: 'part one part two' });
    expect(String(mock.mock.calls[0][0])).toContain('api.exa.ai');
    expect(mock.mock.calls[0][1].headers['x-api-key']).toBe('ex-secret');
    expect(JSON.parse(String(mock.mock.calls[0][1].body)).numResults).toBe(5);
  });

  it('web-search runs TinyFish with its stored key', async () => {
    setWebSearchConfig({ backend: 'tinyfish', tinyfishKey: 'tf-secret' });
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [{ title: 'TF', url: 'https://tf.example/', snippet: 'S' }] }),
    });
    vi.stubGlobal('fetch', mock);
    const { status, body } = await post(app, '/v1/web-search', { query: 'x' }, token);
    expect(status).toBe(200);
    expect(body.provider).toBe('tinyfish');
    expect(body.results[0]).toEqual({ url: 'https://tf.example/', title: 'TF', snippet: 'S' });
    const requested = String(mock.mock.calls[0][0]);
    expect(requested).toContain('api.search.tinyfish.ai');
    expect(requested).toContain('query=x');
    expect(mock.mock.calls[0][1].headers['x-api-key']).toBe('tf-secret');
  });

  it('web-search falls back to keyless DuckDuckGo when the backend lacks its credential', async () => {
    setWebSearchConfig({ backend: 'tavily' }); // no key stored → backend refuses, DDG answers
    const mock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => DDG_FIXTURE });
    vi.stubGlobal('fetch', mock);
    const { status, body } = await post(app, '/v1/web-search', { query: 'x', max_results: 1 }, token);
    expect(status).toBe(200);
    expect(body.provider).toBe('duckduckgo');
    expect(String(mock.mock.calls[0][0])).toContain('html.duckduckgo.com');
  });

  it('web-search 502 carries both errors when the backend and the fallback fail', async () => {
    setWebSearchConfig({ backend: 'searxng', baseUrl: 'http://localhost:8888' });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '<html>anomaly</html>' }));
    const { status, body } = await post(app, '/v1/web-search', { query: 'x' }, token);
    expect(status).toBe(502);
    expect(body.error.message).toContain('searxng');
    expect(body.error.message).toContain('duckduckgo');
  });

  it('web-search walks the fallback chain when the picked backend errors', async () => {
    setWebSearchConfig({ backend: 'brave', braveKey: 'b-secret' });
    const mock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => DDG_FIXTURE });
    vi.stubGlobal('fetch', mock);
    const { status, body } = await post(app, '/v1/web-search', { query: 'x', max_results: 1 }, token);
    expect(status).toBe(200);
    expect(body.provider).toBe('duckduckgo');
    expect(body.attempts).toEqual([
      { backend: 'brave', ok: false, error: 'Brave responded 429' },
      { backend: 'duckduckgo', ok: true },
    ]);
  });

  it('web-search continues past a rate-limited DuckDuckGo to the next keyed backend', async () => {
    setWebSearchConfig({ backend: 'tavily', tavilyKey: 'tvly-secret', tinyfishKey: 'tf-secret' });
    const mock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429 }) // tavily
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '<html>anomaly</html>' }) // DDG rate-limited
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ results: [{ title: 'TF', url: 'https://tf.example/', snippet: 'S' }] }) });
    vi.stubGlobal('fetch', mock);
    const { status, body } = await post(app, '/v1/web-search', { query: 'x' }, token);
    expect(status).toBe(200);
    expect(body.provider).toBe('tinyfish');
    expect(body.attempts.map((a: any) => a.backend)).toEqual(['tavily', 'duckduckgo', 'tinyfish']);
    expect(body.attempts[2].ok).toBe(true);
  });

  it('web-search records every attempt in the daily and monthly quota counters', async () => {
    const before = getWebSearchUsage();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, text: async () => DDG_FIXTURE,
    }));
    const { status } = await post(app, '/v1/web-search', { query: 'x', max_results: 1 }, token);
    expect(status).toBe(200);
    const after = getWebSearchUsage();
    expect(after.daily.duckduckgo).toBe((before.daily.duckduckgo ?? 0) + 1);
    expect(after.monthly.duckduckgo).toBe((before.monthly.duckduckgo ?? 0) + 1);
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
});
