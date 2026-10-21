#!/usr/bin/env node
/**
 * Tiny self-contained demo for the OpenCode free tier.
 *
 *   node src/demo.mjs --list
 *   node src/demo.mjs "Explain a JS closure in one sentence"
 *   node src/demo.mjs --stream "count to 5"
 *   node src/demo.mjs --model glm-5.3-flash-free --session demo-1 "hi"
 *
 * No API key, no build step, no dependencies — Node 20+ only.
 */

import { parseArgs } from 'node:util';
import { OpenCodeFreeClient, DEFAULT_BASE_URL } from './client.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    model: { type: 'string', short: 'm' },
    session: { type: 'string', short: 's' },
    base: { type: 'string' },
    stream: { type: 'boolean', default: false },
    list: { type: 'boolean', default: false },
    temperature: { type: 'string' },
    'max-tokens': { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(`Usage: node src/demo.mjs [options] [prompt]

  -m, --model <id>        model id (default: big-pickle)
  -s, --session <seed>    stable session seed; same seed = same quota identity
      --base <url>        upstream root (default: ${DEFAULT_BASE_URL})
      --stream            print tokens as they arrive
      --list              print the free model roster and exit
      --temperature <n>
      --max-tokens <n>
  -h, --help`);
  process.exit(0);
}

const client = new OpenCodeFreeClient({
  baseUrl: values.base,
  sessionId: values.session,
});

if (values.list) {
  const models = await client.listModels();
  // /models is public and lists the whole zen catalog, paid ids included.
  // Free ones are the `-free` suffix plus a small set without it (`big-pickle`).
  console.log(`${models.length} models on the zen catalog ` +
    `(free: \`-free\` suffix or big-pickle / jev-1.13):`);
  for (const id of models) console.log(`  ${id}`);
  process.exit(0);
}

const prompt = positionals.join(' ').trim();
if (!prompt) {
  console.error('No prompt. Pass one as an argument, or use --list / --help.');
  process.exit(1);
}

const payload = {
  model: values.model ?? 'big-pickle',
  messages: [{ role: 'user', content: prompt }],
  temperature: values.temperature !== undefined ? Number(values.temperature) : undefined,
  max_tokens: values['max-tokens'] !== undefined ? Number(values['max-tokens']) : undefined,
};

console.error(`# session ${client.session}`);
console.error(`# model   ${payload.model}`);

try {
  if (values.stream) {
    let thought = false;
    for await (const chunk of client.stream(payload)) {
      for (const choice of chunk.choices ?? []) {
        const reasoning = choice.delta?.reasoning_content;
        if (reasoning) {
          if (!thought) {
            thought = true;
            process.stderr.write('# thinking ');
          }
          process.stderr.write('.');
        }
        process.stdout.write(choice.delta?.content ?? '');
      }
    }
    if (thought) process.stderr.write('\n');
    process.stdout.write('\n');
  } else {
    const response = await client.complete(payload);
    const message = response.choices[0].message;
    process.stdout.write(`${message.content ?? ''}\n`);
    if (message.tool_calls?.length) {
      console.log('\nTool calls:', JSON.stringify(message.tool_calls, null, 2));
    }
    if (response.usage?.total_tokens) {
      console.error(`# usage   ${response.usage.prompt_tokens} in / ` +
        `${response.usage.completion_tokens} out = ${response.usage.total_tokens} tokens`);
    }
  }
} catch (err) {
  console.error(`\nError: ${err.message}`);
  if (err.hint) console.error(`Hint:  ${err.hint}`);
  process.exitCode = 1;
}
