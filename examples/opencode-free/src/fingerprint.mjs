/**
 * OpenCode free-tier client fingerprint.
 *
 * The zen free tier accepts anonymous traffic (`Authorization: Bearer public`)
 * but gates it on four request properties. Every one is load-bearing; dropping
 * any single one answers 403 FreeTierError instead of reaching the model.
 * Verified 2026-10-22 against both /zen/v1 and /inference/v1:
 *
 *   1. A session header shaped `ses_<12 lowercase hex><14 base62>`. A 6-hex
 *      prefix — what SRouter's own adapter sends today — is rejected.
 *   2. A tool named exactly `read` (any definition; the NAME is what is
 *      checked). `read_last`, `READ`, or `bash`/`glob`/`grep` alone all 403.
 *   3. `stream: true`. `stream: false` answers 403 before inference.
 *   4. A `User-Agent` starting `opencode/`. `curl/x`, `node`, or no UA all 403.
 *
 * `x-opencode-client` and the duplicated session header are tolerated but not
 * required; they are sent because the real CLI sends them.
 */

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const HEX = '0123456789abcdef';

/** `ses_` + 12 lowercase hex + 14 base62 — the shape upstream decodes. */
export const SESSION_RE = /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/;

export const USER_AGENT = 'opencode/latest/2.0.26/cli';

function randomFrom(alphabet, n) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/** A fresh session id in the shape the free-tier gate requires. */
export function generateSessionId() {
  // In the real CLI the 12-hex prefix encodes a timestamp. Upstream validates
  // only the shape here (probed: any 12 hex passes), so random is fine.
  return `ses_${randomFrom(HEX, 12)}${randomFrom(BASE62, 14)}`;
}

/**
 * Map any caller session string onto a valid one. Stable for the same input so
 * a conversation keeps ONE quota identity — minting a new session per request
 * burns the per-session allowance and surfaces as 429 with a growing
 * `retry-after`, which is exactly the failure the real CLI avoids by reusing a
 * long-lived session per conversation.
 */
export function toSessionId(seed) {
  if (typeof seed === 'string' && SESSION_RE.test(seed)) return seed;
  if (!seed) return generateSessionId();

  // FNV-1a over the seed; not security-sensitive, only has to be stable.
  let hash = 0x811c9dc5;
  for (const ch of String(seed)) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // xorshift32 keeps pulling distinct-looking chars out of one 32-bit seed.
  let state = hash || 1;
  const next = () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state;
  };

  let hex = '';
  while (hex.length < 12) hex += HEX[next() % 16];
  let b62 = '';
  while (b62.length < 14) b62 += BASE62[next() % 62];
  return `ses_${hex}${b62}`;
}

// ── Gate tools ──────────────────────────────────────────────────────────────
// Upstream only checks the NAME `read`, but the real CLI sends full
// definitions and the model will call whatever it is handed. These mirror
// OpenCode's own read/shell tools; `shell` is not required by the gate, it is
// here so the pair looks like the CLI's actual tool set.

const READ_DEF = {
  description:
    'Read the contents of a file or directory. Supports text files, images, and PDFs. ' +
    'Each text line is prefixed by its 1-based line number as <line>: <content>. ' +
    'Use offset and limit to read large files or directories in sections.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File or directory to read' },
      offset: { type: 'integer', minimum: 0, description: 'Entry to start reading from (1-based)' },
      limit: { type: 'integer', minimum: 0, description: 'Maximum entries to read' },
    },
    required: ['path'],
    additionalProperties: false,
  },
};

const SHELL_DEF = {
  description:
    'Execute a shell command and return its output. Prefer dedicated tools over shell ' +
    'commands when possible. Commands accept an optional timeout.',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command string to execute' },
      workdir: { type: 'string', description: 'Working directory to execute the command in' },
      timeout: { type: 'integer', minimum: 0, description: 'Timeout in milliseconds' },
    },
    required: ['command'],
    additionalProperties: false,
  },
};

const GATE_TOOLS = { read: READ_DEF, shell: SHELL_DEF };

/** Names of the tools this module appends, in send order. */
export const GATE_TOOL_NAMES = Object.keys(GATE_TOOLS);

function toolName(tool) {
  const fn = tool?.function;
  const name = typeof fn?.name === 'string' ? fn.name : tool?.name;
  return typeof name === 'string' ? name.trim() : '';
}

function renameTool(tool, name) {
  return tool.function
    ? { ...tool, function: { ...tool.function, name } }
    : { ...tool, name };
}

/** True when the caller's tool already carries this gate tool's exact shape. */
function isGateDefinition(tool, key) {
  const def = tool.function ?? tool;
  const gate = GATE_TOOLS[key];
  return def.description === gate.description &&
    JSON.stringify(def.parameters) === JSON.stringify(gate.parameters);
}

/**
 * Return `tools` guaranteed to declare `read` (and `shell`), never producing a
 * duplicate name — upstream rejects those.
 *
 * A caller tool that uses a gate name with a DIFFERENT definition is sent under
 * an alias (`read_client`, `read_client2`, …) so the exact gate definition can
 * be appended; `aliases` maps sent → original so the response can be restored.
 * Case variants such as `Read` are left alone: upstream accepts them alongside
 * `read`.
 *
 * @returns {{ tools: object[], aliases: Map<string,string>, appended: string[] }}
 */
export function withGateTools(tools) {
  const aliases = new Map();
  const out = [];
  const taken = new Set();

  for (const tool of Array.isArray(tools) ? tools : []) {
    if (!tool || typeof tool !== 'object') continue;
    const name = toolName(tool);
    if (!name || taken.has(name)) continue; // drop unnamed and duplicate names

    if (name in GATE_TOOLS && !isGateDefinition(tool, name)) {
      let alias = `${name}_client`;
      for (let i = 2; taken.has(alias); i++) alias = `${name}_client${i}`;
      taken.add(alias);
      aliases.set(alias, name);
      out.push(renameTool(tool, alias));
      continue;
    }

    taken.add(name);
    out.push(tool);
  }

  const appended = [];
  for (const [name, def] of Object.entries(GATE_TOOLS)) {
    if (taken.has(name)) continue;
    out.push({
      type: 'function',
      function: { name, description: def.description, parameters: def.parameters },
    });
    taken.add(name);
    appended.push(name);
  }

  return { tools: out, aliases, appended };
}

/**
 * The appended tools are real definitions the model can call, but there is no
 * executor behind them in this example. Say so in the system message; the
 * real CLI relies on its tool descriptions instead. Wording matters — a blunt
 * "this tool is unavailable" made models refuse the caller's own tools too.
 */
export function notePlaceholderTools(messages, appended) {
  if (!appended.length) return messages;
  const list = appended.map((n) => `\`${n}\``).join(' or ');
  const note = `Do not call the ${list} tool${appended.length > 1 ? 's' : ''}; ` +
    'they are placeholders that do nothing. Use the other tools you have been given instead.';

  const first = messages[0];
  if (first?.role === 'system' && typeof first.content === 'string') {
    return [{ ...first, content: `${first.content}\n\n${note}` }, ...messages.slice(1)];
  }
  return [{ role: 'system', content: note }, ...messages];
}

/**
 * Point an explicit tool_choice at the alias of a concealed caller tool.
 *
 * `aliases` maps sent → original, but tool_choice carries the caller's ORIGINAL
 * name, so the lookup is inverted here.
 */
export function retargetToolChoice(choice, aliases) {
  if (!choice || typeof choice !== 'object' || !aliases.size) return choice;
  const name = choice.function?.name;
  if (typeof name !== 'string') return choice;
  for (const [alias, original] of aliases) {
    if (original === name) return { ...choice, function: { ...choice.function, name: alias } };
  }
  return choice;
}

/** Undo alias renames on the response so the caller sees its own tool names. */
export function restoreToolNames(response, aliases) {
  if (!aliases.size || !Array.isArray(response?.choices)) return response;
  return {
    ...response,
    choices: response.choices.map((choice) => {
      const calls = choice?.message?.tool_calls;
      if (!Array.isArray(calls)) return choice;
      return {
        ...choice,
        message: {
          ...choice.message,
          tool_calls: calls.map((call) => {
            const original = aliases.get(call?.function?.name);
            return original ? { ...call, function: { ...call.function, name: original } } : call;
          }),
        },
      };
    }),
  };
}
