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
export function configPathFor(id: string): string | null {
  const home = envHome();
  switch (id) {
    case 'claude': {
      const claudeSettings = path.join(home, '.claude', 'settings.json');
      if (fs.existsSync(claudeSettings)) return claudeSettings;
      return path.join(home, '.claude.json');
    }
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
    case 'hermes': {
      const localAppData = envPath('LOCALAPPDATA') ?? path.join(home, 'AppData', 'Local');
      const hermesLocal = path.join(localAppData, 'hermes', 'config.yaml');
      if (fs.existsSync(hermesLocal)) return hermesLocal;
      return path.join(envPath('HERMES_HOME') ?? path.join(home, '.hermes'), 'config.yaml');
    }
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
    case 'openclaude': {
      const openclaudeSettings = path.join(home, '.openclaude', 'settings.json');
      if (fs.existsSync(openclaudeSettings)) return openclaudeSettings;
      return path.join(home, '.openclaude.json');
    }
    case 'cursor': {
      const appData = envPath('APPDATA') ?? path.join(home, 'AppData', 'Roaming');
      const settingsPath = path.join(appData, 'Cursor', 'User', 'settings.json');
      if (fs.existsSync(settingsPath)) return settingsPath;
      return path.join(home, '.cursor');
    }
    case 'zed': {
      const zedConfig = path.join(home, '.config', 'zed', 'settings.json');
      if (fs.existsSync(zedConfig)) return zedConfig;
      const appData = envPath('APPDATA') ?? path.join(home, 'AppData', 'Roaming');
      return path.join(appData, 'Zed', 'settings.json');
    }
    case 'jetbrains': {
      const appData = envPath('APPDATA') ?? path.join(home, 'AppData', 'Roaming');
      return path.join(appData, 'JetBrains');
    }
    case 'atomcode':
      return path.join(home, '.atom');
    default:
      return null;
  }
}

/** True when the file's text mentions srouter gateway port, unified key, or provider declarations. */
function mentionsSrouter(filePath: string): boolean {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    // Check for gateway port 20268, unified key sr-*, or explicit environment vars
    if (/20268|sr-[a-f0-9]{16}|SROUTER_API_KEY|SROUTER_URL/i.test(text)) {
      return true;
    }
    // Check for explicit srouter provider, model prefix, or MCP configuration
    if (/["']srouter["']|["']model["']:\s*["']srouter\/|\[(?:model_)?providers?\.srouter\]|\[mcp_servers\.srouter\]/i.test(text)) {
      return true;
    }
    // Check for YAML/TOML provider settings
    if (/(?:^|\n)\s*(?:default_)?provider(?:\s*=|:)\s*["']?srouter["']?/im.test(text)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** CLI executable name for terminal-based agents to check PATH availability. */
function binaryNameFor(id: string): string | null {
  switch (id) {
    case 'claude':
      return 'claude';
    case 'codex':
      return 'codex';
    case 'aider':
      return 'aider';
    case 'opencode':
      return 'opencode';
    case 'goose':
      return 'goose';
    case 'qwen':
      return 'qwen';
    case 'crush':
      return 'crush';
    case 'dsh':
      return 'dsh';
    case 'mimo':
      return 'mimocode';
    case 'omp':
      return 'omp';
    case 'openclaw':
      return 'openclaw';
    case 'hermes':
      return 'hermes';
    case 'pi':
      return 'pi';
    case 'droid':
      return 'droid';
    case 'reasonix':
      return 'reasonix';
    case 'openclaude':
      return 'openclaude';
    case 'kilo':
      return 'kilo';
    default:
      return null;
  }
}

/** Check if binary executable exists in any system PATH directory. */
function isBinaryInPath(name: string): boolean {
  const pathEnv = process.env.PATH || '';
  const dirs = pathEnv.split(path.delimiter);
  const extensions =
    process.platform === 'win32'
      ? (process.env.PATHEXT ? [...process.env.PATHEXT.split(';'), ''] : ['.EXE', '.CMD', '.BAT', ''])
      : [''];

  for (const dir of dirs) {
    if (!dir) continue;
    for (const ext of extensions) {
      const fullPath = path.join(dir, ext ? `${name}${ext}` : name);
      try {
        if (fs.existsSync(fullPath)) {
          return true;
        }
      } catch {
        // Ignore permission or file system errors
      }
    }
  }
  return false;
}

function isAppInstalled(id: string): boolean {
  const binaryName = binaryNameFor(id);
  if (binaryName && isBinaryInPath(binaryName)) return true;

  const home = envHome();
  const localAppData = envPath('LOCALAPPDATA') ?? path.join(home, 'AppData', 'Local');
  const appData = envPath('APPDATA') ?? path.join(home, 'AppData', 'Roaming');

  switch (id) {
    case 'cursor':
      return (
        isBinaryInPath('cursor') ||
        fs.existsSync(path.join(localAppData, 'Programs', 'cursor')) ||
        fs.existsSync(path.join(appData, 'Cursor')) ||
        fs.existsSync(path.join(home, '.cursor')) ||
        (process.platform === 'darwin' && fs.existsSync('/Applications/Cursor.app'))
      );
    case 'zed':
      return (
        isBinaryInPath('zed') ||
        fs.existsSync(path.join(localAppData, 'Programs', 'Zed')) ||
        fs.existsSync(path.join(home, '.config', 'zed')) ||
        (process.platform === 'darwin' && fs.existsSync('/Applications/Zed.app'))
      );
    case 'jetbrains':
      return (
        fs.existsSync(path.join(appData, 'JetBrains')) ||
        fs.existsSync(path.join(localAppData, 'JetBrains')) ||
        fs.existsSync(path.join(home, '.config', 'JetBrains')) ||
        (process.platform === 'darwin' && fs.existsSync(path.join(home, 'Library', 'Application Support', 'JetBrains')))
      );
    case 'atomcode':
      return isBinaryInPath('atom') || fs.existsSync(path.join(home, '.atom'));
    default:
      return false;
  }
}

export function detectAgent(id: string): AgentDetection {
  if (id === 'generic') {
    return { id, installed: false, configured: false, configPath: null };
  }

  const configPath = configPathFor(id);
  const appInstalled = isAppInstalled(id);

  let configFileExists = false;
  if (configPath) {
    try {
      configFileExists = fs.existsSync(configPath);
    } catch {
      configFileExists = false;
    }
  }

  const isCli = binaryNameFor(id) !== null;
  // For CLI tools, the binary executable must exist in PATH to be considered installed.
  // Having a stray config file when the binary is missing does not mean it's installed.
  const installed = isCli ? appInstalled : (appInstalled || configFileExists);

  let configured = false;
  if (installed) {
    if (configFileExists && mentionsSrouter(configPath!)) {
      configured = true;
    } else if (id === 'claude') {
      const home = envHome();
      const mcpPath = path.join(home, '.claude.json');
      if (fs.existsSync(mcpPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
          if (data.mcpServers?.srouter) configured = true;
        } catch {}
      }
    } else if (id === 'continue') {
      const home = envHome();
      const envFilePath = path.join(home, '.continue', '.env');
      if (fs.existsSync(envFilePath) && mentionsSrouter(envFilePath)) {
        configured = true;
      }
    } else if (id === 'openclaude') {
      const home = envHome();
      const mcpPath = path.join(home, '.openclaude.json');
      if (fs.existsSync(mcpPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
          if (data.mcpServers?.srouter) configured = true;
        } catch {}
      }
    }
  }

  return {
    id,
    installed,
    configured,
    configPath,
  };
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