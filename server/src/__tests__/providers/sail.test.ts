import { afterEach, describe, expect, it, vi } from 'vitest';
import { SailProvider } from '../../providers/sail.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function completed(id = 'resp_done', model = 'zai-org/GLM-5.2-FP8') {
  return {
    id,
    model,
    created_at: 1_700_000_000,
    status: 'completed',
    output: [{
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'OK' }],
    }],
    usage: {
      input_tokens: 12,
      output_tokens: 3,
      total_tokens: 15,
      input_tokens_details: { cached_tokens: 2 },
      output_tokens_details: { reasoning_tokens: 1 },
    },
  };
}

describe('SailProvider', () => {
  afterEach(() => {
    // The polling test below installs fake timers per-test; never leak them
    // (or their pending virtual timers) into the next case or the next file.
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('submits a background Responses job, polls it, and normalizes the result', async () => {
    // Every timing surface of the background poll rides ONE virtual clock:
    // the 1000ms deadline at sail.ts:278 reads Date.now() against a
    // startedAt captured at :263, the poll sleep is setTimeout at :250, and
    // fetchWithTimeout's abort deadline is setTimeout at base.ts:335 — all
    // faked by default (vitest 3.2.7, no toFake override). Under real
    // timers the full-suite run flaked this test: the event loop stalled
    // >1000ms under CPU load, so the REAL clock crossed the budget between
    // two mocked fetches that never themselves took a millisecond.
    vi.useFakeTimers();
    const calls: Array<{ url: string; init?: RequestInit; body?: any }> = [];
    vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      calls.push({
        url: String(url),
        init,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (calls.length === 1) {
        return jsonResponse({ id: 'resp_1', status: 'queued' }, 202);
      }
      return jsonResponse(completed('resp_1'));
    });

    const provider = new SailProvider({ pollIntervalMs: 0, timeoutMs: 1_000 });
    const promise = provider.chatCompletion(
      'sail-key',
      [{ role: 'user', content: 'Reply OK' }],
      'zai-org/GLM-5.2-FP8',
      { max_tokens: 64, reasoning_effort: 'none', temperature: 0 },
    );

    // Virtual timeline: tickAsync first yields to a REAL setTimeout, which
    // drains the whole submit → poll → normalize cascade as microtasks
    // while the fake clock is still frozen at t=0 — pollIntervalMs is 0, so
    // wait() is a no-op and no fake timer needs to fire for the chain to
    // settle; the deadline check therefore always sees elapsed 0 < 1000.
    // The 2000ms bump afterwards fires the two request-bound abort timers
    // (armed at t+1000, never cleared per base.ts 'request' bounds) as
    // no-ops on an already-settled chain, leaving zero pending fake timers.
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await promise;

    expect(calls.map(call => call.url)).toEqual([
      'https://api.sailresearch.com/v1/responses',
      'https://api.sailresearch.com/v1/responses/resp_1',
    ]);
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer sail-key');
    expect(calls[0].body).toMatchObject({
      model: 'zai-org/GLM-5.2-FP8',
      input: [{ role: 'user', content: 'Reply OK' }],
      background: true,
      max_output_tokens: 64,
      metadata: { completion_window: 'flex' },
      reasoning: { effort: 'none' },
      temperature: 0,
    });
    expect(result.choices[0].message.content).toBe('OK');
    expect(result.choices[0].finish_reason).toBe('stop');
    expect(result.usage).toEqual({
      prompt_tokens: 12,
      completion_tokens: 3,
      total_tokens: 15,
      prompt_tokens_details: { cached_tokens: 2 },
      completion_tokens_details: { reasoning_tokens: 1 },
    });
    expect(result._routed_via).toEqual({ platform: 'sail', model: 'zai-org/GLM-5.2-FP8' });
  });

  it('maps Chat Completions tools and tool history onto Responses items', async () => {
    let body: any;
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return jsonResponse({
        id: 'resp_tools',
        model: 'moonshotai/Kimi-K2.6',
        status: 'completed',
        output: [{ type: 'function_call', call_id: 'call_new', name: 'weather', arguments: '{"city":"Dublin"}' }],
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      });
    });

    const provider = new SailProvider({ pollIntervalMs: 0 });
    const result = await provider.chatCompletion('k', [
      { role: 'assistant', content: '', tool_calls: [{ id: 'call_old', type: 'function', function: { name: 'weather', arguments: '{"city":"Cork"}' } }] },
      { role: 'tool', content: 'rain', tool_call_id: 'call_old' },
      { role: 'user', content: 'How about Dublin?' },
    ], 'moonshotai/Kimi-K2.6', {
      tools: [{ type: 'function', function: { name: 'weather', description: 'Get weather', parameters: { type: 'object' }, strict: true } }],
      tool_choice: { type: 'function', function: { name: 'weather' } },
    });

    expect(body.input).toEqual([
      { type: 'function_call', call_id: 'call_old', name: 'weather', arguments: '{"city":"Cork"}' },
      { type: 'function_call_output', call_id: 'call_old', output: 'rain' },
      { role: 'user', content: 'How about Dublin?' },
    ]);
    expect(body.tools[0]).toMatchObject({ type: 'function', name: 'weather', strict: true });
    expect(body.tool_choice).toEqual({ type: 'function', name: 'weather' });
    expect(result.choices[0].finish_reason).toBe('tool_calls');
    expect(result.choices[0].message.tool_calls?.[0]).toMatchObject({
      id: 'call_new',
      function: { name: 'weather', arguments: '{"city":"Dublin"}' },
    });
  });

  it('uses flex background mode and clamps gpt-oss none reasoning to low', async () => {
    const bodies: any[] = [];
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      return jsonResponse(completed(`resp_${bodies.length}`, body.model));
    });
    const provider = new SailProvider({ pollIntervalMs: 0 });

    await provider.chatCompletion('k', [{ role: 'user', content: 'hi' }],
      'nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-BF16');
    await provider.chatCompletion('k', [{ role: 'user', content: 'hi' }],
      'openai/gpt-oss-120b', { reasoning_effort: 'none' });

    expect(bodies[0].metadata).toEqual({ completion_window: 'flex' });
    expect(bodies[0].background).toBe(true);
    // 'asap' is rejected for background requests, so the flex window is used
    // for every model now, not just the former flex-only roster.
    expect(bodies[1].metadata).toEqual({ completion_window: 'flex' });
    expect(bodies[1].reasoning).toEqual({ effort: 'low' });
  });

  it('synthesizes streaming chunks from the completed background response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(completed()));
    const provider = new SailProvider({ pollIntervalMs: 0 });
    const chunks = [];
    for await (const chunk of provider.streamChatCompletion(
      'k', [{ role: 'user', content: 'hi' }], 'zai-org/GLM-5.2-FP8',
    )) chunks.push(chunk);

    expect(chunks.map(chunk => chunk.choices[0].delta)).toEqual([
      { role: 'assistant' },
      { content: 'OK' },
      {},
    ]);
    expect(chunks.at(-1)?.choices[0].finish_reason).toBe('stop');
  });

  it('validates keys against the authenticated model roster and preserves errors', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ object: 'list', data: [] }))
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'Invalid API key' } }, 401));
    const provider = new SailProvider();

    await expect(provider.validateKey('good')).resolves.toBe(true);
    await expect(provider.validateKey('bad')).resolves.toEqual({
      valid: false,
      error: 'Sail Research key validation failed (HTTP 401): Invalid API key',
    });
  });
});
