import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatCompletionChunk } from '@baiibayu/srouter-shared/types.js';
import { getProvider, hasProvider } from '../../providers/index.js';
import { isRetryableError } from '../../lib/error-classify.js';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
function completion(model: string, content = '42') {
  return { id: 'test', object: 'chat.completion', created: 1, model,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } };
}
function chunk(model: string, content?: string, finish: 'stop' | null = null): ChatCompletionChunk {
  return { id: 'test', object: 'chat.completion.chunk', created: 1, model,
    choices: [{ index: 0, delta: content === undefined ? { role: 'assistant' } : { content }, finish_reason: finish }] };
}
function sse(chunks: ChatCompletionChunk[], done = false) {
  return new Response(chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('') + (done ? 'data: [DONE]\n\n' : ''), {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
async function collect(source: AsyncGenerator<ChatCompletionChunk>) {
  const result: ChatCompletionChunk[] = [];
  for await (const c of source) result.push(c);
  return result;
}

describe('Septor adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('septor registers and forwards auth, model, options and usage', async () => {
    expect(hasProvider('septor')).toBe(true);
    const fetch = vi.spyOn(global, 'fetch').mockResolvedValue(json(completion('test-model')));
    const result = await getProvider('septor')!.chatCompletion('test-key', [{ role: 'user', content: 'Hi' }], 'test-model', {
      max_tokens: 128, temperature: 0.2, top_p: 0.8,
      tools: [{ type: 'function', function: { name: 'lookup', parameters: { type: 'object', properties: {} } } }],
    });
    expect(fetch.mock.calls[0][0]).toBe('https://api.septorlabs.com/v1/chat/completions');
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get('authorization')).toBe('Bearer test-key');
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({ model: 'test-model', max_tokens: 128, temperature: 0.2, top_p: 0.8 });
    expect(result.usage.total_tokens).toBe(12);
    expect(result._routed_via).toEqual({ platform: 'septor', model: 'test-model' });
  });

  it('Septor validates through its authenticated model endpoint', async () => {
    const fetch = vi.spyOn(global, 'fetch').mockResolvedValue(json({ data: [] }));
    await expect(getProvider('septor')!.validateKey('test-key')).resolves.toBe(true);
    expect(fetch.mock.calls[0][0]).toBe('https://api.septorlabs.com/v1/models');
    expect(fetch.mock.calls[0][1]?.method).toBe('GET');
    // Cloudflare challenges Node's default UA from datacenter IPs (#1298).
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get('user-agent')).toBe('srouter/1.0');
  });

  it.each([401, 403])('Septor rejects invalid credentials (%s)', async status => {
    vi.spyOn(global, 'fetch').mockResolvedValue(json({ error: { message: 'Invalid key' } }, status));
    await expect(getProvider('septor')!.validateKey('bad-test-key')).resolves.toMatchObject({ valid: false });
  });

  it('Septor treats a Cloudflare challenge page as inconclusive, not a bad key', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('<!DOCTYPE html><title>Just a moment...</title>', {
      status: 403, headers: { 'Content-Type': 'text/html', 'cf-mitigated': 'challenge' },
    }));
    await expect(getProvider('septor')!.validateKey('test-key')).rejects.toThrow('Cloudflare challenge');
  });

  it.each(['minimax-m2.5-free', ''])('Septor rejects substituted or missing non-streaming identity (%s)', async returned => {
    vi.spyOn(global, 'fetch').mockResolvedValue(json(completion(returned)));
    const error = await getProvider('septor')!.chatCompletion('test-key', [], 'qwen3-coder-free').catch(e => e);
    expect(error.status).toBe(502);
    expect(isRetryableError(error)).toBe(true);
  });

  it('Septor rejects a substituted stream before leaking content or tool calls', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(sse([chunk('minimax-m2.5-free', 'wrong model', 'stop')]));
    const emitted: ChatCompletionChunk[] = [];
    const consume = async () => {
      for await (const c of getProvider('septor')!.streamChatCompletion('test-key', [], 'qwen3-coder-free')) emitted.push(c);
    };
    await expect(consume()).rejects.toMatchObject({ status: 502 });
    expect(emitted).toEqual([]);
  });

  it('Septor passes matching stream identities and usage', async () => {
    const model = 'qwen3-coder-free';
    vi.spyOn(global, 'fetch').mockResolvedValue(sse([chunk(model, '42', 'stop')], true));
    const result = await collect(getProvider('septor')!.streamChatCompletion('test-key', [], model));
    expect(result[0].choices[0].delta.content).toBe('42');
  });

  it('Septor permits an explicitly requested auto route to name its chosen model', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(json(completion('minimax-m2.5-free')));
    await expect(getProvider('septor')!.chatCompletion('test-key', [], 'auto')).resolves.toMatchObject({ model: 'minimax-m2.5-free' });
  });

  it('septor preserves upstream backoff', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(json({ error: { message: 'Rate limit reached' } }, 429, { 'Retry-After': '60' }));
    await expect(getProvider('septor')!.chatCompletion('test-key', [], 'test-model')).rejects.toMatchObject({ status: 429, retryAfterMs: 60_000 });
  });
});
