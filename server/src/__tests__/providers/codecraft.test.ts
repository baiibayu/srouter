import { afterEach, describe, expect, it, vi } from 'vitest';
import { getProvider } from '../../providers/index.js';
import { AUTH_JSON_PROVIDER_MAP, parseKeysFromFile } from '../../lib/key-parser.js';

const CODECRAFT_BASE_URL = 'https://codecraftapi.com/v1';
const model = 'codecraft-micro';
const json = (body: unknown, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });

describe('CodeCraft', () => {
  afterEach(() => vi.restoreAllMocks());

  it('registers the keyed provider and explicit key-file aliases', () => {
    expect(getProvider('codecraft')).toBeDefined();
    expect(getProvider('codecraft')!.keyless).toBe(false);
    expect(parseKeysFromFile('CODECRAFT_API_KEY=sk-test', 'keys.env').keys[0].platform).toBe('codecraft');
    expect(AUTH_JSON_PROVIDER_MAP.codecraft).toBe('codecraft');
  });

  it('validates through the authenticated /models endpoint without consuming inference', async () => {
    const fetch = vi.spyOn(global, 'fetch').mockResolvedValue(json({ data: [] }));
    expect(await getProvider('codecraft')!.validateKey('test-key')).toBe(true);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${CODECRAFT_BASE_URL}/models`);
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-key');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403])('rejects authentication failure %s', async status => {
    vi.spyOn(global, 'fetch').mockResolvedValue(json({ error: { message: 'Invalid API key' } }, status));
    await expect(getProvider('codecraft')!.validateKey('bad-key')).resolves.toMatchObject({ valid: false });
  });

  it.each([402, 429, 503])('does not treat HTTP %s as a validated or invalid key', async status => {
    vi.spyOn(global, 'fetch').mockResolvedValue(json({}, status, { 'Retry-After': '19' }));
    await expect(getProvider('codecraft')!.validateKey('test-key')).rejects.toMatchObject({ status, retryAfterMs: 19_000 });
  });

  it('preserves chat, JSON mode, token usage and route attribution', async () => {
    const fetch = vi.spyOn(global, 'fetch').mockResolvedValue(json({
      id: 'test', object: 'chat.completion', created: 1, model,
      choices: [{ index: 0, message: { role: 'assistant', content: '{"ok":true}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 4, total_tokens: 9 },
    }));
    const result = await getProvider('codecraft')!.chatCompletion('test-key', [{ role: 'user', content: 'JSON please' }], model,
      { max_tokens: 64, temperature: 0.2, response_format: { type: 'json_object' } });
    expect(fetch.mock.calls[0][0]).toBe(`${CODECRAFT_BASE_URL}/chat/completions`);
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({ model, max_tokens: 64, temperature: 0.2, response_format: { type: 'json_object' } });
    expect(result.choices[0].message.content).toBe('{"ok":true}');
    expect(result.usage?.total_tokens).toBe(9);
    expect(result._routed_via).toEqual({ platform: 'codecraft', model });
  });

  it('streams SSE content and preserves usage', async () => {
    const frames = [
      { id: 's', object: 'chat.completion.chunk', created: 1, model: 'upstream-model', choices: [{ index: 0, delta: { content: 'OK' }, finish_reason: null }] },
      { id: 's', object: 'chat.completion.chunk', created: 1, model: 'upstream-model', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 } },
    ];
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(frames.map(x => `data: ${JSON.stringify(x)}\n\n`).join('') + 'data: [DONE]\n\n'));
    const chunks = [];
    for await (const chunk of getProvider('codecraft')!.streamChatCompletion('test-key', [{ role: 'user', content: 'Hi' }], model)) chunks.push(chunk);
    expect(chunks.map(c => c.choices[0]?.delta.content ?? '').join('')).toBe('OK');
    expect(chunks.find(c => c.usage)?.usage?.total_tokens).toBe(4);
    expect(chunks[0].model).toBe('upstream-model');
  });

  it('preserves chat rate limits and Retry-After', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(json({ error: { message: 'Rate limited' } }, 429, { 'Retry-After': '12' }));
    await expect(getProvider('codecraft')!.chatCompletion('test-key', [], model)).rejects.toMatchObject({ status: 429, retryAfterMs: 12_000 });
  });
});