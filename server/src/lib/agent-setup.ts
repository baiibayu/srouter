import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { configPathFor, detectAgent, type AgentDetection } from './agent-detection.js';

const execFileAsync = promisify(execFile);

function resolveCliPath(): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'cli', 'dist', 'index.js'),
    path.resolve(process.cwd(), '..', 'cli', 'dist', 'index.js'),
    path.resolve(__dirname, '..', '..', '..', 'cli', 'dist', 'index.js'),
    path.resolve(__dirname, '..', '..', 'cli', 'dist', 'index.js'),
  ];
  for (const cand of candidates) {
    if (fs.existsSync(cand)) return cand;
  }
  return null;
}

export interface SetupResult {
  success: boolean;
  message: string;
  detection: AgentDetection;
  output?: string;
}

export async function setupAgent(
  id: string,
  options: { url: string; apiKey?: string },
): Promise<SetupResult> {
  const cliPath = resolveCliPath();
  if (!cliPath) {
    throw new Error('SRouter CLI bundle not found to run setup command');
  }

  const args = [cliPath, `setup-${id}`, '--url', options.url];
  if (options.apiKey) {
    args.push('--api-key', options.apiKey);
  }

  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, args, {
      timeout: 20000,
      env: process.env,
    });
    const detection = detectAgent(id);
    return {
      success: true,
      message: `Setup applied successfully for ${id}`,
      detection,
      output: (stdout || stderr).trim(),
    };
  } catch (error: unknown) {
    const err = error as { message?: string; stdout?: string; stderr?: string };
    const errDetails = err.stderr || err.stdout || err.message || 'Unknown error';
    throw new Error(`Failed to apply setup for ${id}: ${errDetails}`);
  }
}

export async function resetAgent(id: string): Promise<SetupResult> {
  const home = os.homedir();
  const configPath = configPathFor(id);

  try {
    switch (id) {
      case 'claude': {
        const settingsPath = path.join(home, '.claude', 'settings.json');
        if (fs.existsSync(settingsPath)) {
          try {
            const raw = fs.readFileSync(settingsPath, 'utf8');
            const data = JSON.parse(raw);
            if (data.env && typeof data.env === 'object') {
              delete data.env.ANTHROPIC_BASE_URL;
              delete data.env.ANTHROPIC_AUTH_TOKEN;
              delete data.env.ANTHROPIC_MODEL;
              delete data.env.ANTHROPIC_DEFAULT_OPUS_MODEL;
              delete data.env.ANTHROPIC_DEFAULT_SONNET_MODEL;
              delete data.env.ANTHROPIC_DEFAULT_HAIKU_MODEL;
              delete data.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW;
              delete data.env.CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY;
              if (Object.keys(data.env).length === 0) {
                delete data.env;
              }
            }
            if (Object.keys(data).length === 0) {
              fs.unlinkSync(settingsPath);
            } else {
              fs.writeFileSync(settingsPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
            }
          } catch {
            // Ignore format parse errors on reset
          }
        }
        const mcpPath = path.join(home, '.claude.json');
        if (fs.existsSync(mcpPath)) {
          try {
            const raw = fs.readFileSync(mcpPath, 'utf8');
            const data = JSON.parse(raw);
            if (data.mcpServers?.srouter) {
              delete data.mcpServers.srouter;
              if (Object.keys(data.mcpServers).length === 0) {
                delete data.mcpServers;
              }
              fs.writeFileSync(mcpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
            }
          } catch {
            // Ignore parse errors
          }
        }
        break;
      }

      case 'codex': {
        const codexPath = path.join(home, '.codex', 'config.toml');
        if (fs.existsSync(codexPath)) {
          let text = fs.readFileSync(codexPath, 'utf8');
          text = text.replace(/# srouter:start[\s\S]*?# srouter:end\r?\n?/g, '');
          text = text.replace(/^\s*model_provider\s*=\s*"srouter"\r?\n?/gm, '');
          fs.writeFileSync(codexPath, text, 'utf8');
        }
        break;
      }

      case 'openclaw': {
        const openclawJson = path.join(home, '.openclaw', 'openclaw.json');
        if (fs.existsSync(openclawJson)) {
          try {
            const raw = fs.readFileSync(openclawJson, 'utf8');
            const data = JSON.parse(raw);
            if (data.models?.providers?.srouter) {
              delete data.models.providers.srouter;
            }
            if (data.agents?.defaults?.model?.primary?.startsWith('srouter/')) {
              delete data.agents.defaults.model.primary;
            }
            fs.writeFileSync(openclawJson, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
          } catch {
            // Ignore parse errors
          }
        }
        const envPath = path.join(home, '.openclaw', '.env');
        if (fs.existsSync(envPath)) {
          const raw = fs.readFileSync(envPath, 'utf8');
          const filtered = raw.split(/\r?\n/).filter(line => !line.startsWith('SROUTER_API_KEY=')).join('\n');
          fs.writeFileSync(envPath, filtered.endsWith('\n') ? filtered : `${filtered}\n`, 'utf8');
        }
        break;
      }

      case 'roo': {
        const rooPath = path.join(home, '.roo', 'srouter.json');
        if (fs.existsSync(rooPath)) {
          fs.unlinkSync(rooPath);
        }
        break;
      }

      case 'opencode':
      case 'kilo':
      case 'crush':
      case 'mimo': {
        if (configPath && fs.existsSync(configPath)) {
          try {
            const raw = fs.readFileSync(configPath, 'utf8');
            const data = JSON.parse(raw);
            if (data.provider && typeof data.provider === 'object' && data.provider.srouter) {
              delete data.provider.srouter;
              fs.writeFileSync(configPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
            } else if (data.providers && typeof data.providers === 'object' && data.providers.srouter) {
              delete data.providers.srouter;
              fs.writeFileSync(configPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
            }
          } catch {
            // Ignore
          }
        }
        break;
      }

      default: {
        // Generic reset: if config file exists and contains srouter, try to find a .backup-* file and restore it
        if (configPath && fs.existsSync(configPath)) {
          const dir = path.dirname(configPath);
          const base = path.basename(configPath);
          try {
            const files = fs.readdirSync(dir);
            const backups = files
              .filter(f => f.startsWith(`${base}.backup-`))
              .sort()
              .reverse();
            if (backups.length > 0) {
              const latestBackup = path.join(dir, backups[0]);
              fs.copyFileSync(latestBackup, configPath);
            }
          } catch {
            // Ignore backup restore errors
          }
        }
        break;
      }
    }

    const detection = detectAgent(id);
    return {
      success: true,
      message: `Reset completed successfully for ${id}`,
      detection,
    };
  } catch (error: unknown) {
    const err = error as Error;
    throw new Error(`Failed to reset configuration for ${id}: ${err.message}`);
  }
}
