import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { Express } from 'express';

const runWebFetchMock = vi.hoisted(() => vi.fn());
vi.mock('../../services/web-fetch.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/web-fetch.js')>();
  return { ...actual, runWebFetch: runWebFetchMock };
});

import { createApp } from '../../app.js';
import { initDb, getDb, getUnifiedApiKey, setSetting } from '../../db/index.js';
import { mintDashboardToken } from '../helpers/auth.js';
import { WEB_FETCH_FUNCTION_PARAMETERS } from '../../lib/web-fetch-tool.js';

let app: Express;
let dashToken = '';

async function post(path: string, body: any, headers: Record<string, string> = {}) {
  const server = app.listen(0, '127.0.0.1');
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const addr = server.address() as { port: number };
  const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  server.close();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* SSE */ }
  return { status: res.status, text, body: json };
}

function sseEvents(text: string): Array<{ event: string; data: any }> {
  const out: Array<{ event: string; data: any }> = [];
  for (const block of text.split('\n\n')) {
    let event: string | null = null;
    let data: string | null = null;
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7).trim();
      else if (line.startsWith('data: ')) data = line.slice(6);
    }
    if (event && data) out.push({ event, data: JSON.parse(data) });
  }
  return out;
}

const bearer = () => ({ Authorization: `Bearer ${getUnifiedApiKey()}` });

const fetchCall = (url: string, id = 'call_f1') => ({
  id: 'chatcmpl-f', object: 'chat.completion', created: 1, model: 'openai/gpt-oss-120b',
  choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: 'web_fetch', arguments: JSON.stringify({ url }) } }] }, finish_reason: 'tool_calls' }],
  usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
});

const answer = (text: string) => ({
  id: 'chatcmpl-a', object: 'chat.completion', created: 1, model: 'openai/gpt-oss-120b',
  choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
});

function mockGroq(responses: any[]) {
  const bodies: any[] = [];
  const origFetch = global.fetch;
  vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
    const u = typeof url === 'string' ? url : url.toString();
    if (u.includes('api.groq.com/openai/v1/chat/completions')) {
      bodies.push(JSON.parse(String((init as RequestInit).body)));
      const next = responses.shift();
      if (!next) throw new Error('no mocked Groq response left');
      return { ok: true, json: () => Promise.resolve(next) } as any;
    }
    return origFetch(url as any, init);
  });
  return bodies;
}

describe('agent web fetch served from the fetch pool', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    app = createApp();
    dashToken = mintDashboardToken();
    setSetting('enable_mcp', '1');
  });

  beforeEach(async () => {
    const db = getDb();
    db.prepare('DELETE FROM api_keys').run();
    db.prepare('DELETE FROM requests').run();
    db.prepare('DELETE FROM rate_limit_cooldowns').run();
    db.prepare('DELETE FROM rate_limit_usage').run();
    db.prepare(`INSERT INTO settings (key, value) VALUES ('expose_cc_discovery_aliases', '0')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run();
    const { status } = await post('/api/keys', { platform: 'groq', key: 'gsk_web_fetch_test', label: 'g' }, { Authorization: `Bearer ${dashToken}` });
    expect(status).toBe(201);
    runWebFetchMock.mockReset();
    runWebFetchMock.mockResolvedValue({
      ok: true,
      url: 'https://example.com/docs',
      title: 'Documentation',
      text: 'Full documentation content.',
      via: 'direct',
      truncated: false,
    });
  });

  afterEach(() => vi.restoreAllMocks());

  describe('Responses web_fetch tool', () => {
    const request = (extra: Record<string, unknown> = {}) => ({
      model: 'auto',
      input: 'Read the docs at https://example.com/docs',
      tools: [{ type: 'web_fetch' }],
      ...extra,
    });

    it('runs the fetch and reports a web_fetch_call item before the answer', async () => {
      const bodies = mockGroq([fetchCall('https://example.com/docs'), answer('The docs say it is complete.')]);
      const { status, body } = await post('/v1/responses', request(), bearer());

      expect(status).toBe(200);
      expect(runWebFetchMock).toHaveBeenCalledTimes(1);
      expect(runWebFetchMock).toHaveBeenCalledWith('https://example.com/docs', { maxBytes: undefined });
      expect(body.object).toBe('response');
      expect(body.output.map((i: any) => i.type)).toEqual(['web_fetch_call', 'message']);
      expect(body.output[0]).toMatchObject({
        type: 'web_fetch_call',
        status: 'completed',
        action: { type: 'fetch', url: 'https://example.com/docs', title: 'Documentation', via: 'direct' },
      });
      expect(body.output[0].id).toMatch(/^wf_/);
      expect(body.output_text).toBe('The docs say it is complete.');
      expect(bodies[0].tools.map((t: any) => t.function.name)).toEqual(['web_fetch']);
      expect(bodies[1].messages.find((m: any) => m.role === 'tool').content).toContain('Full documentation content.');
    });

    it('streams web_fetch_call events and a completed response', async () => {
      mockGroq([fetchCall('https://example.com/docs'), answer('Done reading.')]);
      const { status, text } = await post('/v1/responses', request({ stream: true }), bearer());

      expect(status).toBe(200);
      const events = sseEvents(text);
      const names = events.map(e => e.event);
      expect(names[0]).toBe('response.created');
      expect(names).toContain('response.web_fetch_call.fetching');
      expect(names).toContain('response.web_fetch_call.completed');
      const completed = events.find(e => e.event === 'response.completed')!.data.response;
      expect(completed.output.map((i: any) => i.type)).toEqual(['web_fetch_call', 'message']);
      expect(completed.id).toBe(events[0].data.response.id);
    });

    it('turns a replayed web_fetch_call into a note on the next assistant turn', async () => {
      const bodies = mockGroq([answer('ok')]);
      await post('/v1/responses', {
        model: 'auto',
        input: [
          { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Read this URL' }] },
          { type: 'web_fetch_call', id: 'wf_1', status: 'completed', action: { type: 'fetch', url: 'https://example.com/docs', title: 'Docs' } },
          { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Read the docs.' }] },
          { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'What did it say?' }] },
        ],
      }, bearer());
      const assistants = bodies[0].messages.filter((m: any) => m.role === 'assistant');
      expect(assistants).toHaveLength(1);
      expect(assistants[0].content).toContain('[Fetched page content from: https://example.com/docs (Docs)]');
      expect(assistants[0].content).toContain('Read the docs.');
    });
  });

  describe('MCP web_fetch tool', () => {
    async function rpc(message: unknown) {
      return post('/mcp', message, bearer());
    }

    it('fetches through runWebFetch and returns page content', async () => {
      const { status, body } = await rpc({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'web_fetch', arguments: { url: 'https://example.com/docs', max_bytes: 10240 } },
      });
      expect(status).toBe(200);
      expect(runWebFetchMock).toHaveBeenCalledWith('https://example.com/docs', { maxBytes: 10240 });
      const data = JSON.parse(body.result.content[0].text);
      expect(data).toEqual({
        url: 'https://example.com/docs',
        title: 'Documentation',
        text: 'Full documentation content.',
        via: 'direct',
        truncated: false,
      });
    });

    it('reports a missing url as a tool error', async () => {
      const { body } = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'web_fetch', arguments: {} } });
      expect(body.result.isError).toBe(true);
    });
  });
});
