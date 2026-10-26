import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import YAML from 'yaml';
import { configPathFor, detectAgent, type AgentDetection } from './agent-detection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
      timeout: 60000,
      env: process.env,
    });
    if (id === 'droid') {
      const droidSettings = path.join(os.homedir(), '.factory', 'settings.json');
      if (fs.existsSync(droidSettings)) {
        try {
          const raw = fs.readFileSync(droidSettings, 'utf8');
          const data = JSON.parse(raw);
          const custom = data.customModels?.[0]?.model ?? 'auto';
          data.model = `custom:${custom}`;
          fs.writeFileSync(droidSettings, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
        } catch {}
      }
    }
    const detection = detectAgent(id);
    return {
      success: true,
      message: `Setup applied successfully for ${id}`,
      detection,
      output: (stdout || stderr).trim(),
    };
  } catch (error: unknown) {
    const err = error as { message?: string; stdout?: string; stderr?: string; killed?: boolean; signal?: string };
    if (err.killed && err.signal === 'SIGTERM') {
      throw new Error(`Setup timed out after 60 seconds for ${id}`);
    }
    const filteredStderr = (err.stderr || '').replace(/Warning: Ignoring extra certs from[^\r\n]*\r?\n?/g, '').trim();
    const filteredStdout = (err.stdout || '').replace(/Warning: Ignoring extra certs from[^\r\n]*\r?\n?/g, '').trim();
    const errDetails = filteredStderr || filteredStdout || err.message || 'Unknown error';
    throw new Error(`Failed to apply setup for ${id}: ${errDetails}`);
  }
}

function removeLinesMatching(filePath: string, pattern: RegExp): void {
  if (!fs.existsSync(filePath)) return;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const filtered = raw
      .split(/\r?\n/)
      .filter(line => !pattern.test(line))
      .join('\n');
    fs.writeFileSync(filePath, filtered.endsWith('\n') ? filtered : `${filtered}\n`, 'utf8');
  } catch {
    // Ignore
  }
}

function removeSrouterMarkers(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const cleaned = raw.replace(/#\s*srouter:start[\s\S]*?#\s*srouter:end\r?\n?/g, '');
    if (cleaned.trim() === '') {
      fs.unlinkSync(filePath);
    } else {
      fs.writeFileSync(filePath, cleaned, 'utf8');
    }
  } catch {
    // Ignore
  }
}

function removeTomlProviders(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  try {
    let text = fs.readFileSync(filePath, 'utf8');
    // Remove srouter marker blocks
    text = text.replace(/#\s*srouter:start[\s\S]*?#\s*srouter:end\r?\n?/g, '');
    // Remove [model_providers.srouter*] tables
    text = text.replace(/\[\s*model_providers\.srouter[^\s\]]*\s*\][\s\S]*?(?=\n\[|\n# srouter|$)/g, '');
    // Remove [mcp_servers.srouter*] tables
    text = text.replace(/\[\s*mcp_servers\.srouter[^\s\]]*\s*\][\s\S]*?(?=\n\[|\n# srouter|$)/g, '');
    // Remove [providers.srouter*] tables
    text = text.replace(/\[\s*providers\.srouter[^\s\]]*\s*\][\s\S]*?(?=\n\[|\n# srouter|$)/g, '');
    // Remove [[providers]] where name = "srouter*"
    text = text.replace(/\[\[\s*providers\s*\]\][\s\S]*?name\s*=\s*"srouter[^"]*"[\s\S]*?(?=\n\[\[|\n\[|$)/g, '');
    // Remove dangling model_provider = "srouter" or default_model = "srouter/*"
    text = text.replace(/^\s*model_provider\s*=\s*['"]srouter.*['"]\r?\n?/gm, '');
    text = text.replace(/^\s*default_model\s*=\s*['"]srouter.*['"]\r?\n?/gm, '');
    fs.writeFileSync(filePath, text, 'utf8');
  } catch {
    // Ignore
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
        removeTomlProviders(path.join(home, '.codex', 'config.toml'));
        break;
      }

      case 'cline': {
        const providersPath = path.join(home, '.cline', 'data', 'settings', 'providers.json');
        if (fs.existsSync(providersPath)) {
          try {
            const raw = fs.readFileSync(providersPath, 'utf8');
            const data = JSON.parse(raw);
            if (data.providers && typeof data.providers === 'object') {
              delete data.providers['openai-compatible'];
              if (data.lastUsedProvider === 'openai-compatible') {
                delete data.lastUsedProvider;
              }
              fs.writeFileSync(providersPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
            }
          } catch {
            // Ignore
          }
        }
        const mcpPath = path.join(home, '.cline', 'data', 'settings', 'cline_mcp_settings.json');
        if (fs.existsSync(mcpPath)) {
          try {
            const raw = fs.readFileSync(mcpPath, 'utf8');
            const data = JSON.parse(raw);
            if (data.mcpServers?.srouter) {
              delete data.mcpServers.srouter;
              fs.writeFileSync(mcpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
            }
          } catch {
            // Ignore
          }
        }
        break;
      }

      case 'continue': {
        const continueYaml = path.join(home, '.continue', 'config.yaml');
        if (fs.existsSync(continueYaml)) {
          removeSrouterMarkers(continueYaml);
          try {
            const raw = fs.readFileSync(continueYaml, 'utf8');
            const doc = YAML.parseDocument(raw, { uniqueKeys: false });
            const models = doc.get('models') as any;
            if (models && models.items) {
              models.items = models.items.filter((item: any) => {
                const j = item.toJSON();
                return !(
                  j?.name === 'SRouter' ||
                  String(j?.apiBase || '').includes('20268') ||
                  String(j?.apiKey || '').includes('SROUTER_API_KEY')
                );
              });
              if (models.items.length === 0) {
                doc.delete('models');
              }
              fs.writeFileSync(continueYaml, doc.toString(), 'utf8');
            }
          } catch {
            // Ignore parse errors on reset
          }
        }
        removeLinesMatching(path.join(home, '.continue', '.env'), /^SROUTER_API_KEY=/);
        break;
      }

      case 'aider': {
        removeSrouterMarkers(path.join(home, '.aider.conf.yml'));
        break;
      }

      case 'opencode': {
        const opencodePath = path.join(home, '.config', 'opencode', 'opencode.json');
        if (fs.existsSync(opencodePath)) {
          try {
            const raw = fs.readFileSync(opencodePath, 'utf8');
            const data = JSON.parse(raw);
            if (data.provider && typeof data.provider === 'object') {
              delete data.provider.srouter;
            }
            if (data.mcp?.servers && typeof data.mcp.servers === 'object') {
              delete data.mcp.servers.srouter;
            }
            if (typeof data.model === 'string' && data.model.startsWith('srouter/')) {
              delete data.model;
            }
            fs.writeFileSync(opencodePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
          } catch {
            // Ignore
          }
        }
        break;
      }

      case 'goose': {
        const providerFile = path.join(home, '.config', 'goose', 'custom_providers', 'srouter.json');
        if (fs.existsSync(providerFile)) {
          try {
            fs.unlinkSync(providerFile);
          } catch {
            // Ignore
          }
        }
        removeSrouterMarkers(path.join(home, '.config', 'goose', 'config.yaml'));
        break;
      }

      case 'qwen': {
        const qwenSettings = path.join(home, '.qwen', 'settings.json');
        if (fs.existsSync(qwenSettings)) {
          try {
            const raw = fs.readFileSync(qwenSettings, 'utf8');
            const data = JSON.parse(raw);
            if (data.modelProviders && typeof data.modelProviders === 'object') {
              delete data.modelProviders.openai;
            }
            if (data.security?.auth?.selectedType === 'openai') {
              delete data.security.auth.selectedType;
            }
            fs.writeFileSync(qwenSettings, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
          } catch {
            // Ignore
          }
        }
        removeLinesMatching(path.join(home, '.qwen', '.env'), /^SROUTER_API_KEY=/);
        break;
      }

      case 'roo': {
        const rooPath = path.join(home, '.roo', 'srouter.json');
        if (fs.existsSync(rooPath)) {
          try { fs.unlinkSync(rooPath); } catch {}
        }
        const rooCliPath = path.join(home, '.roo', 'srouter-cli.json');
        if (fs.existsSync(rooCliPath)) {
          try { fs.unlinkSync(rooCliPath); } catch {}
        }
        const rooSettings = path.join(home, '.roo', 'cli-settings.json');
        if (fs.existsSync(rooSettings)) {
          try {
            const raw = fs.readFileSync(rooSettings, 'utf8');
            const data = JSON.parse(raw);
            if (data.provider === 'openrouter') {
              fs.unlinkSync(rooSettings);
            }
          } catch {}
        }
        break;
      }

      case 'kilo': {
        const kiloPath = path.join(home, '.config', 'kilo', 'kilo.jsonc');
        if (fs.existsSync(kiloPath)) {
          try {
            const raw = fs.readFileSync(kiloPath, 'utf8');
            const data = JSON.parse(raw);
            if (data.provider && typeof data.provider === 'object') {
              delete data.provider['openai-compatible'];
            }
            if (typeof data.model === 'string' && data.model.startsWith('openai-compatible/')) {
              delete data.model;
            }
            fs.writeFileSync(kiloPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
          } catch {}
        }
        break;
      }

      case 'crush': {
        const crushPath = path.join(home, '.config', 'crush', 'crush.json');
        if (fs.existsSync(crushPath)) {
          try {
            const raw = fs.readFileSync(crushPath, 'utf8');
            const data = JSON.parse(raw);
            if (data.providers && typeof data.providers === 'object') {
              delete data.providers.srouter;
            }
            if (data.models?.large?.provider === 'srouter') {
              delete data.models.large;
            }
            if (data.models?.small?.provider === 'srouter') {
              delete data.models.small;
            }
            fs.writeFileSync(crushPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
          } catch {}
        }
        break;
      }

      case 'dsh': {
        const dshHome = process.env.DSH_HOME?.trim() || path.join(home, '.dsh');
        const settingsPath = path.join(dshHome, 'settings.yaml');
        if (fs.existsSync(settingsPath)) {
          try {
            const raw = fs.readFileSync(settingsPath, 'utf8');
            const doc = YAML.parseDocument(raw, { uniqueKeys: false });
            const providers = doc.getIn(['llm-pi-ai', 'providers']) as any;
            if (providers && typeof providers.delete === 'function') {
              providers.delete('srouter');
            }
            const defaultModel = doc.get('agent-default-model') as any;
            if (
              defaultModel &&
              (defaultModel.get?.('provider') === 'srouter' ||
                defaultModel.toJSON?.()?.provider === 'srouter')
            ) {
              doc.delete('agent-default-model');
            }
            fs.writeFileSync(settingsPath, doc.toString(), 'utf8');
          } catch {
            const raw = fs.readFileSync(settingsPath, 'utf8');
            let cleaned = raw.replace(/\s+srouter(?:-[a-z0-9-]+)?:\s*\n(?:\s+.*\n)*/g, '\n');
            cleaned = cleaned.replace(/agent-default-model:\s*\n\s+provider:\s*srouter[\s\S]*?(?=\n\S|$)/g, '');
            fs.writeFileSync(settingsPath, cleaned, 'utf8');
          }
        }
        removeLinesMatching(path.join(dshHome, '.env'), /^SROUTER_API_KEY=/);
        break;
      }

      case 'mimo': {
        const configDir = process.env.MIMOCODE_HOME?.trim()
          ? path.join(process.env.MIMOCODE_HOME.trim(), 'config')
          : (process.env.XDG_CONFIG_HOME?.trim() || path.join(home, '.config', 'mimocode'));
        const configPath = path.join(configDir, 'config.json');
        if (fs.existsSync(configPath)) {
          try {
            const raw = fs.readFileSync(configPath, 'utf8');
            const data = JSON.parse(raw);
            if (data.provider && typeof data.provider === 'object') {
              delete data.provider.srouter;
            }
            if (typeof data.model === 'string' && data.model.startsWith('srouter/')) {
              delete data.model;
            }
            fs.writeFileSync(configPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
          } catch {}
        }
        break;
      }

      case 'openclaw': {
        const stateDir = process.env.OPENCLAW_STATE_DIR?.trim()
          || process.env.OPENCLAW_HOME?.trim()
          || path.join(home, '.openclaw');
        const openclawJson = process.env.OPENCLAW_CONFIG_PATH?.trim()
          || path.join(stateDir, 'openclaw.json');
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
          } catch {}
        }
        removeLinesMatching(path.join(stateDir, '.env'), /^SROUTER_API_KEY=/);
        break;
      }

      case 'hermes': {
        const localAppData = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');
        const hermesDirs = [
          process.env.HERMES_HOME?.trim(),
          path.join(localAppData, 'hermes'),
          path.join(home, '.hermes'),
        ].filter(Boolean) as string[];

        for (const dir of hermesDirs) {
          const configYaml = path.join(dir, 'config.yaml');
          if (fs.existsSync(configYaml)) {
            try {
              const raw = fs.readFileSync(configYaml, 'utf8');
              const doc = YAML.parseDocument(raw, { uniqueKeys: false });
              const model = doc.get('model') as any;
              if (model) {
                const j = model.toJSON ? model.toJSON() : model;
                if (
                  String(j?.base_url || '').includes('20268') ||
                  String(j?.api_key || '').includes('SROUTER_API_KEY') ||
                  j?.provider === 'custom'
                ) {
                  doc.delete('model');
                }
              }
              const providers = doc.get('providers') as any;
              if (providers && typeof providers.delete === 'function') {
                providers.delete('srouter');
              }
              fs.writeFileSync(configYaml, doc.toString(), 'utf8');
            } catch {
              const raw = fs.readFileSync(configYaml, 'utf8');
              let cleaned = raw.replace(/model:\s*\n[\s\S]*?20268[\s\S]*?(?=\n\S|$)/g, '');
              cleaned = cleaned.replace(/\s+srouter(?:-[a-z0-9-]+)?:\s*\n(?:\s+.*\n)*/g, '\n');
              fs.writeFileSync(configYaml, cleaned, 'utf8');
            }
          }
          removeLinesMatching(path.join(dir, '.env'), /^SROUTER_API_KEY=/);
        }
        break;
      }

      case 'pi': {
        const piDir = process.env.PI_CODING_AGENT_DIR?.trim() || path.join(home, '.pi', 'agent');
        const modelsPath = path.join(piDir, 'models.json');
        if (fs.existsSync(modelsPath)) {
          try {
            const raw = fs.readFileSync(modelsPath, 'utf8');
            const data = JSON.parse(raw);
            if (data.providers && typeof data.providers === 'object') {
              for (const k of Object.keys(data.providers)) {
                if (k === 'srouter' || k.startsWith('srouter-')) {
                  delete data.providers[k];
                }
              }
              fs.writeFileSync(modelsPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
            }
          } catch {}
        }
        const settingsPath = path.join(piDir, 'settings.json');
        if (fs.existsSync(settingsPath)) {
          try {
            const raw = fs.readFileSync(settingsPath, 'utf8');
            const data = JSON.parse(raw);
            if (data.defaultProvider === 'srouter' || data.defaultProvider?.startsWith('srouter-')) {
              delete data.defaultProvider;
              delete data.defaultModel;
              fs.writeFileSync(settingsPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
            }
          } catch {}
        }
        break;
      }

      case 'reasonix': {
        const homeDir = process.env.REASONIX_HOME?.trim()
          || (process.platform === 'win32'
            ? path.join(process.env.APPDATA?.trim() || path.join(home, 'AppData', 'Roaming'), 'reasonix')
            : path.join(home, '.reasonix'));
        removeTomlProviders(path.join(homeDir, 'config.toml'));
        removeLinesMatching(path.join(homeDir, '.env'), /^SROUTER_API_KEY=/);
        break;
      }

      case 'omp': {
        const ompDir = path.join(home, '.omp', 'agent');
        const modelsYml = path.join(ompDir, 'models.yml');
        if (fs.existsSync(modelsYml)) {
          try {
            const raw = fs.readFileSync(modelsYml, 'utf8');
            const cleaned = raw.replace(/\s+srouter(?:-[a-z0-9-]+)?:\s*\n(?:\s+.*\n)*/g, '\n');
            fs.writeFileSync(modelsYml, cleaned, 'utf8');
          } catch {}
        }
        const configYml = path.join(ompDir, 'config.yml');
        if (fs.existsSync(configYml)) {
          try {
            const raw = fs.readFileSync(configYml, 'utf8');
            const cleaned = raw.replace(/default:\s*['"]?srouter[^\r\n]*/g, '');
            fs.writeFileSync(configYml, cleaned, 'utf8');
          } catch {}
        }
        break;
      }

      case 'droid': {
        const droidSettings = path.join(home, '.factory', 'settings.json');
        if (fs.existsSync(droidSettings)) {
          try {
            const raw = fs.readFileSync(droidSettings, 'utf8');
            const data = JSON.parse(raw);
            if (typeof data.model === 'string' && data.model.startsWith('custom:')) {
              delete data.model;
            }
            if (Array.isArray(data.customModels)) {
              data.customModels = data.customModels.filter(
                (cm: Record<string, unknown>) =>
                  typeof cm.baseUrl !== 'string' || !/srouter|20268/i.test(cm.baseUrl),
              );
              fs.writeFileSync(droidSettings, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
            }
          } catch {}
        }
        break;
      }

      case 'openclaude': {
        const settingsPath = path.join(home, '.openclaude', 'settings.json');
        if (fs.existsSync(settingsPath)) {
          try {
            const raw = fs.readFileSync(settingsPath, 'utf8');
            const data = JSON.parse(raw);
            if (data.env && typeof data.env === 'object') {
              delete data.env.ANTHROPIC_BASE_URL;
              delete data.env.ANTHROPIC_AUTH_TOKEN;
              delete data.env.OPENAI_BASE_URL;
              delete data.env.OPENAI_API_KEY;
              delete data.env.OPENAI_MODEL;
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
            if (
              typeof data.additionalModelOptionsCacheScope === 'string' &&
              /20268|srouter/i.test(data.additionalModelOptionsCacheScope)
            ) {
              delete data.additionalModelOptionsCacheScope;
              delete data.additionalModelOptionsCache;
            }
            if (Object.keys(data).length === 0) {
              fs.unlinkSync(settingsPath);
            } else {
              fs.writeFileSync(settingsPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
            }
          } catch {}
        }
        const mcpPath = path.join(home, '.openclaude.json');
        if (fs.existsSync(mcpPath)) {
          try {
            const raw = fs.readFileSync(mcpPath, 'utf8');
            const data = JSON.parse(raw);
            if (data.mcpServers?.srouter) {
              delete data.mcpServers.srouter;
              if (Object.keys(data.mcpServers).length === 0) {
                delete data.mcpServers;
              }
            }
            if (
              typeof data.additionalModelOptionsCacheScope === 'string' &&
              /20268|srouter/i.test(data.additionalModelOptionsCacheScope)
            ) {
              delete data.additionalModelOptionsCacheScope;
              delete data.additionalModelOptionsCache;
            }
            fs.writeFileSync(mcpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
          } catch {}
        }
        break;
      }

      default: {
        // Guide agents or unknown
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
