import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectLoop, breakLoop, normalizeToolArgs } from '../../services/loop-breaker.js';
import type { ChatMessage } from '@baiibayu/srouter-shared/types.js';

describe('Loop Breaker Service', () => {
  const originalEnv = process.env.SROUTER_LOOP_BREAKER;

  beforeEach(() => {
    delete process.env.SROUTER_LOOP_BREAKER;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.SROUTER_LOOP_BREAKER = originalEnv;
    } else {
      delete process.env.SROUTER_LOOP_BREAKER;
    }
  });

  it('normalizes tool arguments consistently regardless of JSON key order', () => {
    const jsonA = '{"path":"src/app.ts","encoding":"utf-8"}';
    const jsonB = '{"encoding":"utf-8","path":"src/app.ts"}';
    expect(normalizeToolArgs(jsonA)).toBe(normalizeToolArgs(jsonB));
  });

  it('detects consecutive identical tool call loops', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'check git status and fix files' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: '1', type: 'function', function: { name: 'run_command', arguments: '{"command":"git status"}' } },
        ],
      },
      { role: 'tool', tool_call_id: '1', content: 'modified: app.ts' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: '2', type: 'function', function: { name: 'run_command', arguments: '{"command":"git status"}' } },
        ],
      },
      { role: 'tool', tool_call_id: '2', content: 'modified: app.ts' },
    ];

    const result = detectLoop(messages);
    expect(result.detected).toBe(true);
    expect(result.kind).toBe('tool_call');
    expect(result.repetitionCount).toBe(2);
    expect(result.targetName).toBe('run_command');
  });

  it('does not trigger loop when tools differ', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'read files' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: '1', type: 'function', function: { name: 'read_file', arguments: '{"path":"fileA.ts"}' } },
        ],
      },
      { role: 'tool', tool_call_id: '1', content: 'contents A' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: '2', type: 'function', function: { name: 'read_file', arguments: '{"path":"fileB.ts"}' } },
        ],
      },
      { role: 'tool', tool_call_id: '2', content: 'contents B' },
    ];

    const result = detectLoop(messages);
    expect(result.detected).toBe(false);
  });

  it('detects text repetition loops across turns', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'I am unable to access the file system without permission.' },
      { role: 'user', content: 'please try again' },
      { role: 'assistant', content: 'I am unable to access the file system without permission.' },
    ];

    const result = detectLoop(messages);
    expect(result.detected).toBe(true);
    expect(result.kind).toBe('text');
    expect(result.repetitionCount).toBe(2);
  });

  it('breaks loop by bumping temperature and injecting system guard', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'check files' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: '1', type: 'function', function: { name: 'run_command', arguments: '{"command":"git status"}' } },
        ],
      },
      { role: 'tool', tool_call_id: '1', content: 'modified: app.ts' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: '2', type: 'function', function: { name: 'run_command', arguments: '{"command":"git status"}' } },
        ],
      },
      { role: 'tool', tool_call_id: '2', content: 'modified: app.ts' },
    ];

    const broken = breakLoop({
      messages,
      temperature: 0,
      clientAgent: 'opencode',
    });

    expect(broken.detected).toBe(true);
    expect(broken.temperature).toBe(0.45);
    expect(broken.frequency_penalty).toBe(0.3);
    expect(broken.presence_penalty).toBe(0.3);
    expect(broken.guardInjected).toBe(true);

    // Verify last message received loop guard
    const lastMsg = broken.messages[broken.messages.length - 1];
    expect(typeof lastMsg.content).toBe('string');
    expect(lastMsg.content).toContain('[System Guard: Loop Detected]');
    expect(lastMsg.content).toContain('run_command');

    // Original messages array was not mutated
    expect(messages[messages.length - 1].content).toBe('modified: app.ts');
  });

  it('respects SROUTER_LOOP_BREAKER=off', () => {
    process.env.SROUTER_LOOP_BREAKER = 'off';

    const messages: ChatMessage[] = [
      { role: 'user', content: 'check files' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: '1', type: 'function', function: { name: 'run_command', arguments: '{"command":"git status"}' } },
        ],
      },
      { role: 'tool', tool_call_id: '1', content: 'out' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: '2', type: 'function', function: { name: 'run_command', arguments: '{"command":"git status"}' } },
        ],
      },
      { role: 'tool', tool_call_id: '2', content: 'out' },
    ];

    const broken = breakLoop({
      messages,
      temperature: 0,
      clientAgent: 'opencode',
    });

    expect(broken.detected).toBe(false);
    expect(broken.guardInjected).toBe(false);
    expect(broken.temperature).toBe(0);
  });
});
