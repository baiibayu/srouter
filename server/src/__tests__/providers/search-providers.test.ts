import { describe, it, expect, afterEach, vi } from 'vitest';
import { TavilyProvider } from '../../providers/tavily.js';
import { ExaProvider } from '../../providers/exa.js';
import { FirecrawlProvider } from '../../providers/firecrawl.js';
import { LinkupProvider } from '../../providers/linkup.js';
import { getProvider } from '../../providers/index.js';

// Search platforms (#1174) validate keys without spending search credits and
// refuse chat outright.

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function respond(status: number) {
  const fn = vi.fn(() => Promise.resolve(new Response('{}', { status })));
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

const cases = [
  { provider: new TavilyProvider(), url: 'https://api.tavily.com/usage', method: 'GET' },
  { provider: new ExaProvider(), url: 'https://api.exa.ai/search', method: 'POST' },
  { provider: new FirecrawlProvider(), url: 'https://api.firecrawl.dev/v2/team/credit-usage', method: 'GET' },
  { provider: new LinkupProvider(), url: 'https://api.linkup.so/v1/credits/balance', method: 'GET' },
];

describe.each(cases)('$provider.name key validation', ({ provider, url, method }) => {
  it('probes a no-cost endpoint', async () => {
    const fn = respond(200);
    expect(await provider.validateKey('k')).toBe(true);
    const [calledUrl, init] = (fn.mock.calls as unknown as [string, RequestInit][])[0];
    expect(calledUrl).toBe(url);
    expect(init.method).toBe(method);
  });

  it('treats 401 as an invalid key', async () => {
    respond(401);
    expect(await provider.validateKey('k')).toMatchObject({ valid: false });
  });

  it('treats other 4xx (empty probe body, spent credits) as authenticated', async () => {
    respond(400);
    expect(await provider.validateKey('k')).toBe(true);
  });

  it('reports 5xx as inconclusive', async () => {
    respond(503);
    expect(await provider.validateKey('k')).toMatchObject({ valid: false });
  });

  it('refuses chat completions with a 422', async () => {
    await expect(provider.chatCompletion('k', [], 'm')).rejects.toMatchObject({ status: 422 });
  });
});

describe('registry', () => {
  it('registers every search platform', () => {
    for (const p of ['tavily', 'exa', 'firecrawl', 'linkup'] as const) expect(getProvider(p)?.platform).toBe(p);
  });
});
