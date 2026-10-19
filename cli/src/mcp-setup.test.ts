import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'jsonc-parser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyGeneratedFiles, renderFile } from './config-files.js';
import { mcpEndpoint, mcpSnippetNote } from './mcp.js';
import { tools } from './tools.js';
import type { GenerateContext } from './types.js';

// XDG/env relocations change several generated paths and snippet targets; pin
// them the way tools.test.ts does so expectations hold on every host.
beforeEach(() => {
  vi.stubEnv('XDG_CONFIG_HOME', '');
  vi.stubEnv('MIMOCODE_HOME', '');
  vi.stubEnv('DSH_HOME', '');
  vi.stubEnv('OPENCLAW_HOME', '');
  vi.stubEnv('OPENCLAW_STATE_DIR', '');
  vi.stubEnv('OPENCLAW_CONFIG_PATH', '');
  vi.stubEnv('HERMES_HOME', '');
  vi.stubEnv('PI_CODING_AGENT_DIR', '');
  vi.stubEnv('REASONIX_HOME', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of temporary.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const temporary: string[] = [];

function tempHome(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'srouter-mcp-'));
  temporary.push(directory);
  return directory;
}

const context: GenerateContext = {
  url: 'http://localhost:20268',
  apiKey: 'srouter-test-key',
  profile: 'default',
  homeDir: '/home/tester',
  models: [
    { id: 'auto', name: 'Auto', available: true, context_window: 131072 },
    { id: 'fast-coder', name: 'Fast Coder', available: true, context_window: 131072 },
  ],
};

function tool(id: string) {
  return tools.find(entry => entry.id === id)!;
}

function asPosix(p: string): string {
  return process.platform === 'win32' ? p.replaceAll('\\', '/') : p;
}

describe('mcp endpoint', () => {
  it('appends /mcp to the origin and strips trailing slashes and /v1', () => {
    expect(mcpEndpoint('http://localhost:20268')).toBe('http://localhost:20268/mcp');
    expect(mcpEndpoint('http://localhost:20268/')).toBe('http://localhost:20268/mcp');
    expect(mcpEndpoint('http://localhost:20268/v1')).toBe('http://localhost:20268/mcp');
    expect(mcpEndpoint('https://gw.example.com///v1/')).toBe('https://gw.example.com/mcp');
  });
});

describe('setup-claude MCP wiring', () => {
  it('writes a user-scope mcpServers entry into ~/.claude.json beside settings.json', () => {
    const generation = tool('claude').generate(context);
    const mcpFile = generation.files.find(file => asPosix(file.path).endsWith('/.claude.json'))!;
    expect(mcpFile).toBeDefined();
    expect(mcpFile.sensitive).toBe(true);
    expect(mcpFile.value).toEqual({
      mcpServers: {
        srouter: {
          type: 'http',
          url: 'http://localhost:20268/mcp',
          headers: { Authorization: 'Bearer srouter-test-key' },
        },
      },
    });
    expect(generation.notes.join('\n')).toContain('MCP: wrote mcpServers.srouter');
    // settings.json keeps its chat env and does NOT gain an mcpServers key
    // (Claude Code ignores mcpServers in settings.json).
    const settings = generation.files.find(file => asPosix(file.path).endsWith('settings.json'))!;
    expect(settings.value).not.toHaveProperty('mcpServers');
  });

  it('points a named profile at $CLAUDE_CONFIG_DIR/.claude.json', () => {
    const generation = tool('claude').generate({ ...context, profile: 'work' });
    const mcpFile = generation.files.find(file => asPosix(file.path).endsWith('/.claude.json'))!;
    expect(asPosix(mcpFile.path)).toBe('/home/tester/.claude/profiles/work/.claude.json');
  });
});

describe('setup-codex MCP wiring', () => {
  it('adds a [mcp_servers.srouter] HTTP block that reads the key from the environment', () => {
    const generation = tool('codex').generate(context);
    const content = generation.files[0].content!;
    expect(content).toContain('[mcp_servers.srouter]');
    expect(content).toContain('url = "http://localhost:20268/mcp"');
    expect(content).toContain('bearer_token_env_var = "SROUTER_API_KEY"');
    // The unified key must not leak into the TOML.
    expect(content).not.toContain('srouter-test-key');
    expect(generation.notes.join('\n')).toContain('MCP: wrote mcp_servers.srouter');
  });

  it('also writes the MCP block for a named profile', () => {
    const content = tool('codex').generate({ ...context, profile: 'work' }).files[0].content!;
    expect(content).toContain('[mcp_servers.srouter]');
    expect(content).toContain('[profiles.work]');
  });
});

describe('setup-cline MCP wiring', () => {
  it('writes a streamableHttp entry into cline_mcp_settings.json', () => {
    const generation = tool('cline').generate(context);
    const mcpFile = generation.files.find(file => asPosix(file.path).endsWith('cline_mcp_settings.json'))!;
    expect(mcpFile).toBeDefined();
    expect(mcpFile.sensitive).toBe(true);
    expect(mcpFile.value).toEqual({
      mcpServers: {
        srouter: {
          type: 'streamableHttp',
          url: 'http://localhost:20268/mcp',
          headers: { Authorization: 'Bearer srouter-test-key' },
          disabled: false,
          autoApprove: [],
        },
      },
    });
  });
});

describe('setup-opencode MCP wiring', () => {
  it('adds a remote mcp.servers entry next to the provider config', () => {
    const generation = tool('opencode').generate(context);
    const file = generation.files[0];
    const value = file.value as Record<string, any>;
    expect(value.mcp.servers.srouter).toEqual({
      type: 'remote',
      url: 'http://localhost:20268/mcp',
      oauth: false,
      headers: { Authorization: 'Bearer srouter-test-key' },
    });
    // The chat provider entry survives next to the MCP entry.
    expect(value.provider.srouter.options.baseURL).toBe('http://localhost:20268/v1');
    expect(generation.notes.join('\n')).toContain('MCP: wrote mcp.servers.srouter');
  });
});

describe('snippet output for tools without a written MCP entry', () => {
  it('names the config file and embeds a ready-to-paste HTTP snippet', () => {
    const notes = tool('continue').generate(context).notes.join('\n');
    expect(notes).toContain('MCP: add to /home/tester/.continue/config.yaml');
    expect(notes).toContain('"type":"http"');
    expect(notes).toContain('http://localhost:20268/mcp');
    expect(notes).toContain('Bearer <unified-key>');
  });

  it('uses a TOML-flavored snippet for reasonix', () => {
    const notes = tool('reasonix').generate(context).notes.join('\n');
    expect(notes).toContain('MCP: add to');
    expect(notes).toContain('[mcp_servers.srouter]');
    expect(notes).toContain('bearer_token_env_var = "SROUTER_API_KEY"');
  });

  it('uses the OpenCode-style shape for mimo', () => {
    const notes = tool('mimo').generate(context).notes.join('\n');
    expect(notes).toContain('"mcp": { "servers": { "srouter"');
    expect(notes).toContain('"type": "remote"');
  });

  it('says aider has no MCP support instead of inventing a config', () => {
    const notes = tool('aider').generate(context).notes.join('\n');
    expect(notes).toContain('MCP: aider has no MCP support');
    expect(notes).not.toContain('MCP: add to');
  });

  it('every tool reports an MCP outcome', () => {
    for (const entry of tools) {
      expect(entry.generate(context).notes.some(note => note.startsWith('MCP:'))).toBe(true);
    }
  });

  it('mcpSnippetNote uses a key placeholder, keeping the unified key out of snippet notes', () => {
    const note = mcpSnippetNote(context, 'your MCP client config');
    expect(note).toContain('Bearer <unified-key>');
    expect(note).not.toContain('srouter-test-key');
  });
});

describe('idempotent MCP config writes', () => {
  it('keeps a single claude mcpServers.srouter entry and preserves unrelated keys', () => {
    const home = tempHome();
    const mcpPath = path.join(home, '.claude.json');
    fs.writeFileSync(mcpPath, JSON.stringify({
      oauthAccount: { email: 'user@example.com' },
      mcpServers: {
        other: { command: 'npx', args: ['-y', 'other-mcp'] },
      },
    }, null, 2));
    const generation = tool('claude').generate({ ...context, homeDir: home });
    applyGeneratedFiles(generation.files, false);
    applyGeneratedFiles(tool('claude').generate({ ...context, homeDir: home }).files, false);
    const merged = parse(fs.readFileSync(mcpPath, 'utf8')) as any;
    expect(merged.oauthAccount.email).toBe('user@example.com');
    expect(merged.mcpServers.other).toEqual({ command: 'npx', args: ['-y', 'other-mcp'] });
    expect(merged.mcpServers.srouter.url).toBe('http://localhost:20268/mcp');
    expect(fs.readFileSync(mcpPath, 'utf8').match(/"srouter"/g)).toHaveLength(1);
  });

  it('keeps a single [mcp_servers.srouter] block in codex config.toml', () => {
    const home = tempHome();
    const codexPath = path.join(home, '.codex', 'config.toml');
    fs.mkdirSync(path.dirname(codexPath), { recursive: true });
    fs.writeFileSync(codexPath, [
      '# user notes',
      'approval_policy = "on-request"',
      '',
      '[mcp_servers.preexisting]',
      'command = "npx"',
      '',
    ].join('\n'));
    const run = () => applyGeneratedFiles(tool('codex').generate({ ...context, homeDir: home }).files, false);
    run();
    run();
    const merged = fs.readFileSync(codexPath, 'utf8');
    expect(merged).toContain('# user notes');
    expect(merged).toContain('approval_policy = "on-request"');
    expect(merged).toContain('[mcp_servers.preexisting]');
    expect(merged.match(/\[mcp_servers\.srouter\]/g)).toHaveLength(1);
    expect(merged.match(/url = "http:\/\/localhost:20268\/mcp"/g)).toHaveLength(1);
  });

  it('keeps a single opencode mcp.servers.srouter entry and preserves the provider', () => {
    const home = tempHome();
    const opencodePath = path.join(home, '.config', 'opencode', 'opencode.json');
    fs.mkdirSync(path.dirname(opencodePath), { recursive: true });
    fs.writeFileSync(opencodePath, JSON.stringify({
      $schema: 'https://opencode.ai/config.json',
      theme: 'dark',
      mcp: { servers: { preexisting: { type: 'remote', url: 'https://example.com/mcp' } } },
    }, null, 2));
    const run = () => applyGeneratedFiles(tool('opencode').generate({ ...context, homeDir: home }).files, false);
    run();
    run();
    const merged = parse(fs.readFileSync(opencodePath, 'utf8')) as any;
    expect(merged.theme).toBe('dark');
    expect(merged.mcp.servers.preexisting.url).toBe('https://example.com/mcp');
    expect(merged.mcp.servers.srouter.url).toBe('http://localhost:20268/mcp');
    expect(merged.provider.srouter.name).toBe('SRouter');
    expect(fs.readFileSync(opencodePath, 'utf8').match(/"srouter"/g).length).toBeGreaterThan(0);
    // Exactly one srouter MCP object, not duplicated by the second run.
    expect(Object.keys(merged.mcp.servers)).toEqual(['preexisting', 'srouter']);
  });

  it('keeps a single cline mcpServers.srouter entry', () => {
    const home = tempHome();
    const run = () => applyGeneratedFiles(tool('cline').generate({ ...context, homeDir: home }).files, false);
    run();
    run();
    const mcpPath = path.join(home, '.cline', 'data', 'settings', 'cline_mcp_settings.json');
    const merged = parse(fs.readFileSync(mcpPath, 'utf8')) as any;
    expect(Object.keys(merged.mcpServers)).toEqual(['srouter']);
    expect(merged.mcpServers.srouter.url).toBe('http://localhost:20268/mcp');
  });

  it('claude .claude.json merge is a no-op on a second render', () => {
    const generation = tool('claude').generate(context);
    const mcpFile = generation.files.find(file => asPosix(file.path).endsWith('/.claude.json'))!;
    const first = renderFile(mcpFile);
    const second = renderFile(mcpFile, first);
    expect(second).toBe(first);
  });
});
