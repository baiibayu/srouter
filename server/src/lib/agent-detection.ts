import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Per-agent config-file detection for the dashboard's Agents page.
 *
 * The CLI generators in cli/src/tools.ts write a config file (or env note) for
 * every agent they support. This module mirrors those paths so the server can
 * tell, without running the CLI, whether an agent is installed and pointed at
 * this gateway. It is intentionally best-effort: config files move between
 * releases, env-var agents (OpenClaude, AtomCode) and guide-only agents
 * (Cursor, Zed, JetBrains) have no file to read, and a user may have configured
 * an agent by hand in a location this does not know about. What it answers
 * reliably is "is there a config file that mentions srouter" — the question the
 * dashboard's status badge needs.
 */

export interface AgentDetection {
  id: string;
  /** A config file exists on disk for this agent. */
  installed: boolean;
  /**
   * The existing config mentions srouter — i.e. it was (re)configured for this
   * gateway rather than left pointing at some other provider. A file that
   * exists but does not mention srouter is "installed but not ours".
   */
  configured: boolean;
  /** The file that was checked, or null when this agent has no config file. */
  configPath: string | null;
}

function envHome(): string {
  return os.homedir();
}

function envPath(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

/** The config file each file-based agent writes, or null for env/guide agents. */
function configPathFor(id: string): string | null {
  const home = envHome();
  switch (id) {
    case 'claude':
      return path.join(home, '.claude.json');
    case 'codex':
      return path.join(home, '.codex', 'config.toml');
    case 'cline':
      return path.join(home, '.cline', 'data', 'settings', 'providers.json');
    case 'continue':
      return path.join(home, '.continue', 'config.yaml');
    case 'aider':
      return path.join(home, '.aider.conf.yml');
    case 'opencode':
      return path.join(home, '.config', 'opencode', 'opencode.json');
    case 'goose':
      return path.join(home, '.config', 'goose', 'config.yaml');
    case 'qwen':
      return path.join(home, '.qwen', 'settings.json');
    case 'roo':
      return path.join(home, '.roo', 'srouter.json');
    case 'kilo':
      return path.join(home, '.config', 'kilo', 'kilo.jsonc');
    case 'crush':
      return path.join(home, '.config', 'crush', 'crush.json');
    case 'dsh':
      return path.join(envPath('DSH_HOME') ?? path.join(home, '.dsh'), 'settings.yaml');
    case 'mimo':
      return path.join(
        envPath('MIMOCODE_HOME') ?? envPath('XDG_CONFIG_HOME') ?? path.join(home, '.config'),
        'mimocode',
        'config.json',
      );
    case 'omp':
      return path.join(home, '.omp', 'agent', 'config.yml');
    case 'openclaw':
      return path.join(
        envPath('OPENCLAW_CONFIG_PATH')
          ?? envPath('OPENCLAW_STATE_DIR')
          ?? envPath('OPENCLAW_HOME')
          ?? path.join(home, '.openclaw'),
        'openclaw.json',
      );
    case 'hermes':
      return path.join(envPath('HERMES_HOME') ?? path.join(home, '.hermes'), 'config.yaml');
    case 'pi':
      return path.join(
        envPath('PI_CODING_AGENT_DIR') ?? path.join(home, '.pi', 'agent'),
        'settings.json',
      );
    case 'reasonix': {
      const reasonixHome = envPath('REASONIX_HOME')
        ?? (process.platform === 'win32'
          ? path.join(envPath('APPDATA') ?? path.join(home, 'AppData', 'Roaming'), 'reasonix')
          : path.join(home, '.reasonix'));
      return path.join(reasonixHome, 'config.toml');
    }
    case 'droid':
      return path.join(home, '.factory', 'settings.json');
    // Env-var agents (OpenClaude, AtomCode) and guide-only agents
    // (Cursor, Zed, JetBrains, Generic) write no config file.
    default:
      return null;
  }
}

/** True when the file's text mentions srouter — the marker every generator
 *  writes (provider name, base URL host, or the setup command itself). */
function mentionsSrouter(filePath: string): boolean {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return /srouter/i.test(text);
  } catch {
    return false;
  }
}

export function detectAgent(id: string): AgentDetection {
  const configPath = configPathFor(id);
  if (!configPath) {
    return { id, installed: false, configured: false, configPath: null };
  }
  let installed = false;
  try {
    installed = fs.existsSync(configPath);
  } catch {
    installed = false;
  }
  if (!installed) {
    return { id, installed: false, configured: false, configPath };
  }
  return { id, installed: true, configured: mentionsSrouter(configPath), configPath };
}

/** The full catalog of agents the dashboard renders, in display order. */
export const AGENT_IDS = [
  'claude',
  'codex',
  'cline',
  'continue',
  'aider',
  'opencode',
  'goose',
  'qwen',
  'roo',
  'kilo',
  'crush',
  'dsh',
  'mimo',
  'omp',
  'openclaw',
  'hermes',
  'pi',
  'reasonix',
  'droid',
  'cursor',
  'zed',
  'jetbrains',
  'openclaude',
  'atomcode',
  'generic',
] as const;

export function detectAllAgents(): AgentDetection[] {
  return AGENT_IDS.map(id => detectAgent(id));
}