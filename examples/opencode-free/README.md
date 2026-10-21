# OpenCode Free — working example

A minimal, dependency-free implementation of the **OpenCode zen free tier** as an
OpenAI-compatible client. No API key, no build step, Node 20+ only.

This is the same idea as `9router`'s `open-sse/executors/opencode.js`: the free
tier is anonymous (`Authorization: Bearer public`) but gated on request
properties that identify the official OpenCode CLI. This example reproduces that
fingerprint in ~600 lines, documents which parts of it are actually enforced,
and ships a mock upstream so it can be exercised offline.

```
examples/opencode-free/
├── package.json
├── README.md
└── src/
    ├── fingerprint.mjs   # session ids, gate tools, tool aliasing
    ├── client.mjs        # OpenAI-compatible client, stream + assemble
    ├── demo.mjs          # CLI: one prompt, streaming or not
    ├── mock-server.mjs   # local upstream that enforces the same gate
    └── selftest.mjs      # offline proof that each rule is satisfied/enforced
```

## Run it

```bash
cd examples/opencode-free

# 1. Offline: verify the gate is implemented correctly (no network, no quota)
node src/selftest.mjs

# 2. Offline: run the demo against the local mock upstream
node src/mock-server.mjs &                       # terminal 1
node src/demo.mjs --base http://127.0.0.1:8787 "hello"

# 3. Live: against the real free tier
node src/demo.mjs --list                         # public, no gate
node src/demo.mjs "Explain a JS closure in one sentence"
node src/demo.mjs --stream "count to 5"
node src/demo.mjs --model glm-5.3-flash-free --session demo-1 "hi"
```

`--session <seed>` pins the quota identity: the same seed always produces the
same `ses_…` value, which is how the real CLI keeps one long-lived session per
conversation. Omitting it mints a fresh one per process.

## Use it as a library

```js
import { OpenCodeFreeClient } from './src/client.mjs';

const client = new OpenCodeFreeClient({ sessionId: 'my-conversation' });

// Non-streaming: the SSE stream is assembled into one Chat Completion.
const res = await client.complete({
  model: 'big-pickle',
  messages: [{ role: 'user', content: 'hi' }],
});
console.log(res.choices[0].message.content);

// Streaming: yields upstream ChatCompletionChunk objects.
for await (const chunk of client.stream({ model: 'big-pickle', messages })) {
  process.stdout.write(chunk.choices?.[0]?.delta?.content ?? '');
}
```

The client takes and returns the ordinary Chat Completions shapes, so it can
drop in wherever an OpenAI-compatible call is made.

## The gate, rule by rule

Each rule was verified on **2026-10-22** against `opencode.ai` by varying one
property at a time. "403" below means `{"error":{"type":"FreeTierError"}}`.

| # | Rule | Verdict without it |
|---|------|--------------------|
| 1 | Session header shaped `ses_` + **12** lowercase hex + 14 base62 | 403 |
| 2 | A tool named exactly `read` is declared | 403 |
| 3 | `stream: true` | 403 |
| 4 | `User-Agent` starts with `opencode/` | 403 |

Notes from the probes, which differ from what the older 9router/SRouter code
assumes:

- **`read` is the only required tool, and only its name is checked.** A `read`
  tool with an empty schema passes. `bash`, `glob`, `grep`, `read_last`, and
  `READ` alone all 403. SRouter's current adapter sends a `bash/glob/grep/read`
  quartet — that works, but the trio is dead weight.
- **The session prefix length is load-bearing.** `ses_` + 6 hex (what
  `server/src/providers/opencode-free.ts` sends today) → 403. Changing *only*
  that to 12 hex → the request reaches the model (429/200).
- **The `User-Agent` version does not matter**, only the `opencode/` prefix.
  `opencode/latest/2.0.26/cli`, `opencode/2.0.26`, and the v1
  `opencode/1.18.31 ai-sdk/… bun/…` form all pass. `curl/8`, `node`, and no UA
  at all fail.
- **`x-opencode-client`, `x-opencode-session-id`, `x-opencode-project`, and
  `x-opencode-request` are not required.** Sending them changes nothing; the
  example sends `x-opencode-client` and the duplicated session header because
  the real CLI does.
- **`tool_choice: "none"` is accepted.** 9router's code warns that upstream
  403s it; that was not reproducible here. The example still avoids it, since
  it is meaningless with an involuntary `read` tool present.
- **`/zen/v1` and `/inference/v1` behave identically** for the gate. The example
  defaults to `/inference/v1` (the v2 CLI path); `--base` switches.
- **`GET /models` is ungated** and needs no UA or session — it returns the whole
  zen catalogue (paid ids included), not the free roster.

### Quota, not authentication

A correctly fingerprinted request can still answer **429
`FreeUsageLimitError`**. That is the per-identity free allowance, not a gate
failure — the `retry-after` header states the wait (observed: ~2.8 hours after a
short burst of probes). Two consequences:

- A proxy must pass 429 through as a quota signal rather than treating it like
  403, or a healthy key looks broken.
- Session identity is the billing key. Minting a fresh session per request
  burns the allowance fastest; `toSessionId(seed)` exists to prevent that.

## Design notes

**Tool aliasing.** Upstream rejects duplicate tool names. If a caller supplies
its own `read`, the example renames it to `read_client` on the wire and restores
the original name in the response — the caller never sees the alias. This is the
same mechanism as 9router's `opencodeFingerprint.js`, trimmed to what matters.

**Placeholder note.** The appended `read`/`shell` tools are real definitions the
model can call, but there is no executor behind them in this example, so a
system message tells the model they are placeholders. Without that, a model will
try to read files. 9router learned the same lesson: wording such as "this tool
is unavailable" caused models to refuse the caller's own tools too, so the note
says "placeholders that do nothing, use the other tools" instead.

**Streaming always.** The client never asks upstream for `stream: false`;
`complete()` consumes the SSE stream and assembles the response, including
tool-call fragments keyed by `index`.

## Verifying the findings yourself

`src/mock-server.mjs` encodes the four rules exactly. `src/selftest.mjs` checks
both directions — that a well-formed request passes, and that breaking each rule
producing `403 FreeTierError`. Run it after any change to `fingerprint.mjs`.

## Caveats

This is an example, not a supported integration. It relies on upstream behavior
that can change without notice, it is unaffiliated with OpenCode, and the free
tier's terms — including whether prompts are retained for training — are
OpenCode's to set. Use it to understand the mechanism; for production routing,
configure the platform in SRouter itself (`server/src/providers/opencode-free.ts`).
