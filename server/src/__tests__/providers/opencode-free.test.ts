import { describe, it, expect } from 'vitest';
import {
  OpenCodeFreeProvider,
  normalizeUpstreamModelId,
} from '../../providers/opencode-free.js';

describe('OpenCodeFreeProvider', () => {
  const provider = new OpenCodeFreeProvider();

  it('normalizes model IDs correctly', () => {
    expect(normalizeUpstreamModelId('oc-deepseek-v4.1-flash')).toBe('deepseek-v4.1-flash-free');
    expect(normalizeUpstreamModelId('deepseek-v4.1-flash')).toBe('deepseek-v4.1-flash-free');
    expect(normalizeUpstreamModelId('oc/deepseek-v4.1-flash-free')).toBe('deepseek-v4.1-flash-free');
    expect(normalizeUpstreamModelId('deepseek-v4.1-flash-free')).toBe('deepseek-v4.1-flash-free');
    expect(normalizeUpstreamModelId('big-pickle')).toBe('big-pickle');
    expect(normalizeUpstreamModelId('beam-free')).toBe('beam-free');
    expect(normalizeUpstreamModelId('flint-40b')).toBe('flint-40b-free');
  });

  it('buildBody sets fingerprint tools and env prompt marker', () => {
    const body = (provider as any).buildBody(
      [{ role: 'user', content: 'hello' }],
      'deepseek-v4.1-flash',
    );

    expect(body.model).toBe('deepseek-v4.1-flash-free');
    expect(body.stream).toBe(true);
    expect(body.store).toBe(false);

    // Tools must include read and shell
    const toolNames = body.tools.map((t: any) => t.function?.name);
    expect(toolNames).toContain('read');
    expect(toolNames).toContain('shell');

    // System prompt must contain the <env> marker
    const systemMsg = body.messages.find((m: any) => m.role === 'system');
    expect(systemMsg).toBeDefined();
    expect(systemMsg.content).toContain('<env>');
    expect(systemMsg.content).toContain('</env>');
  });

  it('preserves caller tools alongside fingerprint tools', () => {
    const callerTool = {
      type: 'function' as const,
      function: {
        name: 'custom_search',
        description: 'Search things',
        parameters: { type: 'object', properties: {} },
      },
    };

    const body = (provider as any).buildBody(
      [{ role: 'user', content: 'test' }],
      'deepseek-v4.1-flash-free',
      { tools: [callerTool] },
    );

    const toolNames = body.tools.map((t: any) => t.function?.name);
    expect(toolNames).toContain('custom_search');
    expect(toolNames).toContain('read');
    expect(toolNames).toContain('shell');

    const systemMsg = body.messages.find((m: any) => m.role === 'system');
    expect(systemMsg.content).toContain('Do not call the `read` or `shell` tools');
  });

  it('generates valid identity headers', () => {
    const headers = (provider as any).identityHeaders();
    expect(headers['Authorization']).toBe('Bearer public');
    expect(headers['User-Agent']).toContain('opencode');
    expect(headers['x-opencode-client']).toBe('cli');
    expect(headers['x-opencode-session']).toMatch(/^ses_/);
    expect(headers['x-opencode-project']).toBe('global');
    expect(headers['Accept']).toBe('text/event-stream');
  });
});
