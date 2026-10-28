import path from 'node:path';
import type { GenerateContext, Generation } from './types.js';

/** The MCP server name written into every client config. Matches the shape
 *  documented in docs/en/clients/01-agent-clients.md (claude mcp add ... SRouter
 *  http://localhost:20268/mcp with the unified key as Bearer). */
export const MCP_SERVER_NAME = 'srouter';

export const MCP_TOGGLE_NOTE =
  'MCP: the dashboard toggle Keys -> Agents -> Enable MCP must be ON or /mcp answers 403.';

export const MCP_TOOLS_SUMMARY =
  'MCP gives agents mid-session access to SRouter tools: ask_srouter, web_search, web_fetch, list_models, '
  + 'provider_health, provider_list, usage_summary, cache_stats, compression_stats, quota_outlook, '
  + 'routing_info, set_routing_strategy, healthcheck, clear_cache.';

/** Same normalization as tools.ts rootUrl(): trailing slashes and a /v1 suffix
 *  are stripped, then /mcp is appended — the endpoint routes/mcp.ts serves. */
export function mcpEndpoint(url: string): string {
  const root = url.trim().replace(/\/+$/, '').replace(/\/v1$/i, '').replace(/\/+$/, '');
  return `${root}/mcp`;
}

function posixPath(...segments: string[]): string {
  return path.join(...segments).split(path.sep).join('/');
}

/** Claude Code user-scope MCP entry (settings.json does NOT read mcpServers;
 *  user scope is ~/.claude.json, or $CLAUDE_CONFIG_DIR/.claude.json for a
 *  profile — the file `claude mcp add --scope user` writes). Transport and
 *  header shape follow docs/en/clients/01-agent-clients.md. */
export function claudeMcpValue(ctx: GenerateContext): Record<string, unknown> {
  return {
    mcpServers: {
      [MCP_SERVER_NAME]: {
        type: 'http',
        url: mcpEndpoint(ctx.url),
        headers: { Authorization: `Bearer ${ctx.apiKey}` },
      },
    },
  };
}

/** Codex Streamable-HTTP MCP block for ~/.codex/config.toml. The key is NOT
 *  written to the file — Codex reads the Bearer token from $SROUTER_API_KEY,
 *  the same variable the chat config already uses (env_key = "SROUTER_API_KEY"). */
export function codexMcpToml(url: string): string[] {
  return [
    `[mcp_servers.${MCP_SERVER_NAME}]`,
    `url = ${JSON.stringify(mcpEndpoint(url))}`,
    'bearer_token_env_var = "SROUTER_API_KEY"',
  ];
}

/** OpenCode remote MCP entry (mcp.servers.<name>, the non-deprecated shape in
 *  https://opencode.ai/config.json). oauth:false so the Bearer header wins. */
export function opencodeMcpValue(ctx: GenerateContext): Record<string, unknown> {
  return {
    mcp: {
      servers: {
        [MCP_SERVER_NAME]: {
          type: 'remote',
          url: mcpEndpoint(ctx.url),
          oauth: false,
          headers: { Authorization: `Bearer ${ctx.apiKey}` },
        },
      },
    },
  };
}

/** Cline CLI MCP settings (streamableHttp transport, per docs.cline.bot). */
export function clineMcpValue(ctx: GenerateContext): Record<string, unknown> {
  return {
    mcpServers: {
      [MCP_SERVER_NAME]: {
        type: 'streamableHttp',
        url: mcpEndpoint(ctx.url),
        headers: { Authorization: `Bearer ${ctx.apiKey}` },
        disabled: false,
        autoApprove: [],
      },
    },
  };
}

export function clineMcpPath(homeDir: string): string {
  return posixPath(homeDir, '.cline', 'data', 'settings', 'cline_mcp_settings.json');
}

/** One-line ready-to-paste snippet for agents whose MCP file shape this repo
 *  does not document. JSON flavor matches the mcpServers object Claude/Cline
 *  style clients read; TOML flavor matches Codex's [mcp_servers.*] tables.
 *  The key is a placeholder, not the literal unified key: several generators
 *  (goose, kilo, …) deliberately keep the key out of their config, and their
 *  tests assert the whole generation never carries it. */
export function mcpSnippetNote(
  ctx: GenerateContext,
  target: string,
  flavor: 'json' | 'toml' = 'json',
): string {
  if (flavor === 'toml') {
    return `MCP: add to ${target}: [mcp_servers.${MCP_SERVER_NAME}] with url = "${mcpEndpoint(ctx.url)}" and bearer_token_env_var = "SROUTER_API_KEY" (Streamable HTTP; export SROUTER_API_KEY first)`;
  }
  const snippet = JSON.stringify({
    [MCP_SERVER_NAME]: {
      type: 'http',
      url: mcpEndpoint(ctx.url),
      headers: { Authorization: 'Bearer <unified-key>' },
    },
  });
  return `MCP: add to ${target}: ${snippet} (Streamable HTTP MCP config; unified key from --api-key / SROUTER_API_KEY)`;
}

/** Per-tool target file for the generic snippet. Honours the same env
 *  relocations the generators honour where they are cheap to mirror; falls
 *  back to the default location. */
export function mcpSnippetTarget(id: string, ctx: GenerateContext): string | undefined {
  const home = ctx.homeDir;
  switch (id) {
    case 'aider':
      return undefined; // Aider has no MCP support.
    case 'continue':
      return posixPath(home, '.continue', 'config.yaml');
    case 'qwen':
      return posixPath(home, '.qwen', 'settings.json');
    case 'goose':
      return posixPath(home, '.config', 'goose', 'config.yaml');
    case 'kilo':
      return posixPath(home, '.config', 'kilo', 'kilo.jsonc');
    case 'crush':
      return posixPath(home, '.config', 'crush', 'crush.json');
    case 'dsh':
      return posixPath(process.env.DSH_HOME?.trim() || posixPath(home, '.dsh'), 'settings.yaml');
    case 'mimo':
      return posixPath(
        process.env.MIMOCODE_HOME?.trim()
          ? posixPath(process.env.MIMOCODE_HOME.trim(), 'config')
          : posixPath(process.env.XDG_CONFIG_HOME?.trim() || posixPath(home, '.config'), 'mimocode'),
        'config.json',
      );
    case 'omp':
      return posixPath(home, '.omp', 'agent', 'config.yml');
    case 'openclaw':
      return process.env.OPENCLAW_CONFIG_PATH?.trim()
        || posixPath(
          process.env.OPENCLAW_STATE_DIR?.trim()
            || posixPath(process.env.OPENCLAW_HOME?.trim() || home, '.openclaw'),
          'openclaw.json',
        );
    case 'hermes':
      return posixPath(process.env.HERMES_HOME?.trim() || posixPath(home, '.hermes'), 'config.yaml');
    case 'pi':
      return posixPath(
        process.env.PI_CODING_AGENT_DIR?.trim() || posixPath(home, '.pi', 'agent'),
        'settings.json',
      );
    case 'reasonix': {
      const reasonixHome = process.env.REASONIX_HOME?.trim()
        || (process.platform === 'win32'
          ? path.join(process.env.APPDATA?.trim() || path.join(home, 'AppData', 'Roaming'), 'reasonix')
          : path.join(home, '.reasonix'));
      return posixPath(reasonixHome, 'config.toml');
    }
    case 'droid':
      return posixPath(home, '.factory', 'settings.json');
    case 'zcode':
      return posixPath(home, '.zcode', 'cli', 'setting.json');
    default:
      return 'your MCP client config';
  }
}

/**
 * Appends the one-line "MCP: add to ..." guidance for generators that did not
 * already write an MCP entry (writers add their own precise "MCP: wrote ..."
 * note). Aider is called out as having no MCP support; every other tool gets
 * a ready-to-paste snippet naming the file to put it in.
 */
export function withMcpNotes(id: string, generation: Generation, ctx: GenerateContext): Generation {
  if (generation.notes.some(note => note.startsWith('MCP:'))) return generation;
  if (id === 'aider') {
    return {
      ...generation,
      notes: [...generation.notes, 'MCP: aider has no MCP support; nothing to configure.'],
    };
  }
  const target = mcpSnippetTarget(id, ctx) ?? 'your MCP client config';
  // MiMo is an OpenCode derivative: its config schema mirrors OpenCode's, so
  // the snippet uses mcp.servers.<name> rather than a mcpServers object.
  if (id === 'mimo') {
    return {
      ...generation,
      notes: [
        ...generation.notes,
        `MCP: add to ${target}: "mcp": { "servers": { "${MCP_SERVER_NAME}": { "type": "remote", "url": "${mcpEndpoint(ctx.url)}", "oauth": false, "headers": { "Authorization": "Bearer <unified-key>" } } } } (OpenCode-style remote MCP config)`,
      ],
    };
  }
  const flavor = target.endsWith('.toml') ? 'toml' : 'json';
  return {
    ...generation,
    notes: [...generation.notes, mcpSnippetNote(ctx, target, flavor)],
  };
}
