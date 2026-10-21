#!/usr/bin/env node
/**
 * Self-test: proves the client satisfies each gate rule, and that the gate
 * actually rejects a request when a rule is broken. Runs entirely offline
 * against src/mock-server.mjs.
 *
 *   node src/selftest.mjs
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { OpenCodeFreeClient } from './client.mjs';
import {
  SESSION_RE, toSessionId, withGateTools, GATE_TOOL_NAMES,
  retargetToolChoice, restoreToolNames,
} from './fingerprint.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// ── Pure helpers ────────────────────────────────────────────────────────────
console.log('fingerprint:');
check('generated session matches the gate shape', SESSION_RE.test(new OpenCodeFreeClient().session));
check('a valid session seed is passed through unchanged',
  toSessionId('ses_0123456789abCDEFghijklmnop') === 'ses_0123456789abCDEFghijklmnop');
check('the same seed maps to the same session',
  toSessionId('conversation-1') === toSessionId('conversation-1'));
check('different seeds map to different sessions',
  toSessionId('a') !== toSessionId('b'));
check('a 6-hex session (the old SRouter shape) is NOT passed through',
  !SESSION_RE.test('ses_012345abcdefABCDEFghijkl'));

const noTools = withGateTools([]);
check('read is appended when no tools are supplied',
  noTools.tools.some((t) => t.function?.name === 'read'));
check('appended names are reported', noTools.appended.includes('read'));

const withCaller = withGateTools([
  { type: 'function', function: { name: 'get_weather', description: 'w', parameters: { type: 'object', properties: {} } } },
]);
check('caller tools survive untouched',
  withCaller.tools.some((t) => t.function?.name === 'get_weather'));
check('no duplicate names are produced',
  new Set(withCaller.tools.map((t) => t.function?.name)).size === withCaller.tools.length);

const conflicting = withGateTools([
  { type: 'function', function: { name: 'read', description: 'my own read', parameters: { type: 'object', properties: {} } } },
]);
check('a caller tool reusing a gate name is aliased',
  conflicting.tools.some((t) => t.function?.name === 'read_client'));
check('the alias maps back to the original name',
  conflicting.aliases.get('read_client') === 'read');
check('the exact gate definition is still appended',
  conflicting.tools.filter((t) => t.function?.name === 'read').length === 1);

// tool_choice carries the caller's ORIGINAL name and must be pointed at the
// alias; the response then carries the alias and must be mapped back.
check('tool_choice is retargeted to the alias',
  retargetToolChoice({ type: 'function', function: { name: 'read' } }, conflicting.aliases)
    ?.function?.name === 'read_client');
check('a tool_choice that was not aliased is left alone',
  retargetToolChoice({ type: 'function', function: { name: 'read' } }, new Map())
    ?.function?.name === 'read');

const aliasedResponse = restoreToolNames({
  choices: [{
    index: 0,
    message: { tool_calls: [{ id: 'c1', function: { name: 'read_client', arguments: '{}' } }] },
  }],
}, conflicting.aliases);
check('the alias is restored to the caller\'s tool name on the response',
  aliasedResponse.choices[0].message.tool_calls[0].function.name === 'read');

// ── Live rules against the mock upstream ────────────────────────────────────
const server = spawn(process.execPath, [join(here, 'mock-server.mjs')], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore',
});
try {
  // Wait for the port to answer instead of sleeping a fixed amount.
  for (let i = 0; ; i++) {
    try {
      await fetch(`${BASE}/models`);
      break;
    } catch {
      if (i > 100) throw new Error('mock server did not start');
      await delay(50);
    }
  }

  console.log('\ngate rules against the mock upstream:');

  const client = new OpenCodeFreeClient({ baseUrl: BASE, sessionId: 'selftest' });
  const ok = await client.complete({
    model: 'big-pickle',
    messages: [{ role: 'user', content: 'ping' }],
  });
  check('a well-formed request is accepted', ok.choices[0].message.content.includes('gate passed'));

  // Each probe sends the same body with exactly one rule broken.
  const baseBody = {
    model: 'big-pickle',
    messages: [{ role: 'user', content: 'ping' }],
    stream: true,
    tools: GATE_TOOL_NAMES.map((name) => ({ type: 'function', function: { name } })),
  };
  const goodHeaders = client.headers();
  // Headers are case-insensitive but plain objects are not, so a probe that
  // overrides one by a different casing would send both.
  const headersWithout = (...drop) => Object.fromEntries(
    Object.entries(goodHeaders).filter(([key]) => !drop.includes(key.toLowerCase())),
  );

  async function send(headers, body) {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, type: json?.error?.type };
  }

  const probes = [
    ['a non-opencode User-Agent is rejected', { ...headersWithout('user-agent'), 'User-Agent': 'curl/8.5.0' }, baseBody],
    ['a 6-hex session is rejected', { ...goodHeaders, 'x-opencode-session': 'ses_012345abcdefABCDEFghijkl', 'x-opencode-session-id': 'ses_012345abcdefABCDEFghijkl' }, baseBody],
    ['stream:false is rejected', goodHeaders, { ...baseBody, stream: false }],
    ['a request without the `read` tool is rejected', goodHeaders, { ...baseBody, tools: [{ type: 'function', function: { name: 'bash' } }] }],
    ['a duplicated tool name is rejected', goodHeaders, { ...baseBody, tools: [{ type: 'function', function: { name: 'read' } }, { type: 'function', function: { name: 'read' } }] }],
  ];

  for (const [label, headers, body] of probes) {
    const { status, type } = await send(headers, body);
    check(label, status === 403 && type === 'FreeTierError', `got ${status} ${type}`);
  }

  // Streaming path + alias restoration.
  const aliased = new OpenCodeFreeClient({ baseUrl: BASE, sessionId: 'selftest' });
  let streamed = '';
  for await (const chunk of aliased.stream({
    model: 'big-pickle',
    messages: [{ role: 'user', content: 'ping' }],
  })) {
    streamed += chunk.choices?.[0]?.delta?.content ?? '';
  }
  check('the streaming path assembles content', streamed.includes('gate passed'));

  const many = await client.complete({
    model: 'big-pickle',
    messages: [{ role: 'user', content: 'ping' }],
    tools: [{ type: 'function', function: { name: 'my_tool', description: 'd', parameters: { type: 'object', properties: {} } } }],
    tool_choice: { type: 'function', function: { name: 'my_tool' } },
  });
  check('a caller tool and an explicit tool_choice still pass the gate',
    typeof many.choices[0].message.content === 'string');
} finally {
  server.kill();
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
