import { afterEach, describe, expect, it, vi } from 'vitest';
import { getProvider, hasProvider } from '../../providers/index.js';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const completion = (model: string) => ({ id: 'test', object: 'chat.completion', created: 1, model,
  choices: [{ index: 0, message: { role: 'assistant', content: '17' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 8, completion_tokens: 1, total_tokens: 9 } });
const stream = (model: string) => new Response(`data: ${JSON.stringify({ id: 'test', object: 'chat.completion.chunk', created: 1, model,
  choices: [{ index: 0, delta: { content: '17' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });

const PLATFORMS = ['nous', 'typhoon', 'plugsky', 'tokenharbor', 'alibaba'] as const;
const BASE: Record<(typeof PLATFORMS)[number], string> = {
  nous: 'https://inference-api.nousresearch.com/v1',
  typhoon: 'https://api.opentyphoon.ai/v1',
  plugsky: 'https://plugsky.com/v1',
  tokenharbor: 'https://tokenharbor.ai/v1',
  alibaba: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
};

describe('Nous Portal, OpenTyphoon, Plugsky, Token Harbor and Alibaba Model Studio adapters', () => {
  afterEach(() => vi.restoreAllMocks());

  // plugsky (like typhoon) validates on its own authenticated usage endpoint —
  // see plugsky.test.ts — and treats a non-OK status as inconclusive, so it does
  // not share this /models contract.
  it.each(PLATFORMS.filter(p => p !== 'typhoon' && p !== 'plugsky'))('%s validates on the authenticated /models endpoint', async platform => {
    expect(hasProvider(platform)).toBe(true);
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ data: [] }));
    await expect(getProvider(platform)!.validateKey('test-key')).resolves.toBe(true);
    expect(fetch.mock.calls[0][0]).toBe(`${BASE[platform]}/models`);
    expect(fetch.mock.calls[0][1]?.method).toBe('GET');
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer test-key');
    fetch.mockResolvedValue(json({ error: { message: 'Invalid key' } }, 401));
    await expect(getProvider(platform)!.validateKey('test-key')).resolves.toMatchObject({ valid: false });
    // The base adapter only discriminates 401/403: any other upstream status
    // (like a transient 503) must not invalidate the key.
    fetch.mockResolvedValue(json({ error: 'Unavailable' }, 503));
    await expect(getProvider(platform)!.validateKey('test-key')).resolves.toBe(true);
  });

  it.each(PLATFORMS)('%s sends the exact requested IDs and streams a matching upstream response', async platform => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(completion('test-model')));
    const provider = getProvider(platform)!;
    const result = await provider.chatCompletion('test-key', [{ role: 'user', content: '8+9' }], 'test-model', { max_tokens: 64, temperature: 0.2 });
    expect(result.model).toBe('test-model');
    expect(result.usage.total_tokens).toBe(9);
    expect(result._routed_via).toEqual({ platform, model: 'test-model' });
    expect(fetch.mock.calls[0][0]).toBe(`${BASE[platform]}/chat/completions`);
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({ model: 'test-model', max_tokens: 64, temperature: 0.2 });
    fetch.mockResolvedValue(stream('test-model'));
    const emitted = [];
    for await (const chunk of provider.streamChatCompletion('test-key', [], 'test-model')) emitted.push(chunk);
    expect(emitted.flatMap(c => c.choices).map(c => c.delta.content ?? '').join('')).toBe('17');
  });

  it.each(PLATFORMS)('%s preserves provider backoff and never retries a 429', async platform => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: { message: 'Quota exhausted' } }, 429, { 'Retry-After': '60' }));
    await expect(getProvider(platform)!.chatCompletion('test-key', [], 'test-model')).rejects.toMatchObject({ status: 429, retryAfterMs: 60000 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
