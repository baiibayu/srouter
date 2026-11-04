import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

const { mockRouteRequest } = vi.hoisted(() => ({ mockRouteRequest: vi.fn() }));
vi.mock('../../services/router.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/router.js')>();
  return { ...actual, routeRequest: mockRouteRequest };
});

import type { Express } from 'express';
import { createApp } from '../../app.js';
import { initDb, getDb, getUnifiedApiKey } from '../../db/index.js';

function fakeRoute(provider: any) {
  return { provider, modelId: 'fake-model', modelDbId: 9999, apiKey: 'k', keyId: 1, platform: 'fake', displayName: 'Fake Model' };
}

async function post(app: Express, path: string, body: any, key?: string, headers: Record<string, string> = {}) {
  const server = app.listen(0, '127.0.0.1');
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const addr = server.address() as any;
  const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}), ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  server.close();
  return { status: res.status, text, contentType: res.headers.get('content-type') ?? '', headers: res.headers };
}

describe('POST /v1/responses Loop Breaker', () => {
  let app: Express;
  let key: string;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    key = getUnifiedApiKey(getDb());
    app = createApp();
  });

  beforeEach(() => {
    mockRouteRequest.mockReset();
    const provider = {
      chatCompletion: vi.fn().mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'done' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    };
    mockRouteRequest.mockReturnValue(fakeRoute(provider));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects tool call repetitions on /v1/responses and sets X-SRouter-Loop-Breaker header', async () => {
    // 2 consecutive assistant turns with identical tool call signatures
    const res = await post(app, '/v1/responses', {
      model: 'auto',
      input: [
        { role: 'user', content: 'run task' },
        { role: 'assistant', content: 'running command' },
        { type: 'function_call', call_id: 'call_1', name: 'exec_command', arguments: '{"cmd":"npm test"}' },
        { type: 'function_call_output', call_id: 'call_1', output: 'error' },
        { role: 'assistant', content: 'retrying command' },
        { type: 'function_call', call_id: 'call_2', name: 'exec_command', arguments: '{"cmd":"npm test"}' },
        { type: 'function_call_output', call_id: 'call_2', output: 'error' },
      ],
      tools: [
        {
          type: 'function',
          name: 'exec_command',
          description: 'Run a shell command',
          parameters: { type: 'object', properties: { cmd: { type: 'string' } } },
        },
      ],
    }, key, { 'User-Agent': 'codex-cli/0.165.0' });

    expect(res.status).toBe(200);
    const loopHeader = res.headers.get('x-srouter-loop-breaker');
    expect(loopHeader).toBeDefined();
    expect(loopHeader).toContain('detected=tool_call');
    expect(loopHeader).toContain('count=2');
    expect(loopHeader).toContain('target=exec_command');
  });
});
