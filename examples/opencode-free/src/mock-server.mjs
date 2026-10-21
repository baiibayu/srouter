#!/usr/bin/env node
/**
 * Local stand-in for the OpenCode zen free tier.
 *
 * It enforces the SAME four rules the real upstream enforces, so the demo can
 * be exercised end-to-end with no network and without spending real quota:
 *
 *   node src/mock-server.mjs            # listens on http://127.0.0.1:8787
 *   node src/demo.mjs --base http://127.0.0.1:8787 "hello"
 *
 * Every rule below was confirmed against the live upstream on 2026-10-22 by
 * varying one property at a time (see README, "The gate, rule by rule").
 */

import { createServer } from 'node:http';
import { SESSION_RE, USER_AGENT } from './fingerprint.mjs';

const PORT = Number(process.env.PORT ?? 8787);
const MODEL_IDS = ['big-pickle', 'glm-5.3-flash-free', 'deepseek-v4.1-flash-free'];

/** @returns {string|null} the failing rule, or null when the request passes */
function gateFailure(req, body) {
  const ua = req.headers['user-agent'] ?? '';
  if (!ua.startsWith('opencode/')) return 'bad User-Agent';

  const session = req.headers['x-opencode-session'] ?? req.headers['x-opencode-session-id'];
  if (typeof session !== 'string' || !SESSION_RE.test(session)) return 'bad session id';

  if (body.stream !== true) return 'stream must be true';

  const names = (body.tools ?? []).map((t) => {
    const name = t?.function?.name ?? t?.name;
    return typeof name === 'string' ? name.trim() : '';
  });
  if (!names.includes('read')) return 'missing `read` tool';

  const duplicate = names.length !== new Set(names).size;
  if (duplicate) return 'duplicate tool name';

  return null;
}

function send(res, status, payload) {
  const text = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
}

/** Deterministic pseudo-answer so repeated runs are comparable. */
function answerFor(messages) {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  const text = typeof last?.content === 'string' ? last.content : '';
  return `(mock) I received: "${text}". The gate passed — session, UA, stream, and the \`read\` tool were all accepted.`;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname.endsWith('/models')) {
    return send(res, 200, {
      object: 'list',
      data: MODEL_IDS.map((id) => ({ id, object: 'model', owned_by: 'opencode' })),
    });
  }

  if (req.method !== 'POST' || !url.pathname.endsWith('/chat/completions')) {
    return send(res, 404, { error: { type: 'NotFound', message: `no route ${req.method} ${url.pathname}` } });
  }

  let raw = '';
  for await (const chunk of req) raw += chunk;
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return send(res, 400, { error: { type: 'InvalidRequest', message: 'body is not JSON' } });
  }

  const failure = gateFailure(req, body);
  if (failure) {
    // The real upstream uses this exact type for every gate rejection.
    return send(res, 403, {
      type: 'error',
      error: { type: 'FreeTierError', message: `OpenCode's free tier rejected the request (${failure}).` },
    });
  }

  const content = answerFor(body.messages ?? []);
  const base = {
    id: 'chatcmpl-mock',
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: body.model ?? 'big-pickle',
  };

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  // Split the answer so the demo exercises real multi-frame assembly.
  const words = content.split(/(?<= )/);
  for (const word of words) {
    res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { content: word } }] })}\n\n`);
    await new Promise((r) => setTimeout(r, 10));
  }
  res.write(`data: ${JSON.stringify({
    ...base,
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    usage: { prompt_tokens: 8, completion_tokens: words.length, total_tokens: 8 + words.length },
  })}\n\n`);
  // The real upstream omits [DONE]; the client must not depend on it.
  res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock zen upstream on http://127.0.0.1:${PORT} (UA prefix: ${USER_AGENT})`);
  console.log(`try: node src/demo.mjs --base http://127.0.0.1:${PORT} "hello"`);
});
