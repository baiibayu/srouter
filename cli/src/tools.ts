import path from 'node:path';
import type {
  CatalogModel,
  GenerateContext,
  Generation,
  ToolDefinition,
} from './types.js';

/** Generated config-file paths (and any path echoed into notes) are always
 *  POSIX-style on every platform. Node's fs accepts `/` on Windows, every
 *  tool being configured reads it fine, and the golden snapshots pin this
 *  form — path.join() would emit the host separator and break them. */
function posixPath(...segments: string[]): string {
  return path.join(...segments).split(path.sep).join('/');
}

function rootUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').replace(/\/v1$/i, '');
}

function v1Url(url: string): string {
  return `${rootUrl(url)}/v1`;
}

function primaryModel(models: CatalogModel[], requestedId?: string): CatalogModel {
  // An explicit --model wins over every heuristic below. It is validated
  // against the UNFILTERED catalog before we get here, so an id absent from
  // `models` (the available-only roster) is a real, registered model that is
  // merely out of quota right now — pin it anyway rather than silently writing
  // a different model into the user's config.
  if (requestedId) return models.find(model => model.id === requestedId) ?? { id: requestedId };
  // `auto` — the router picking the best model per request — is the whole
  // point of the gateway and the right default for a generated config. Never
  // fall back to `fusion` (multi-model fan-out) by accident.
  return models.find(model => model.id === 'auto')
    ?? models.find(model => model.id !== 'fusion' && model.available !== false)
    ?? models.find(model => model.id !== 'fusion')
    ?? { id: 'auto', name: 'Auto', context_window: 128_000 };
}

function catalogModels(models: CatalogModel[]): CatalogModel[] {
  const available = models.filter(model => model.id !== 'auto' && model.available !== false);
  if (available.length) return available;
  const nonAuto = models.filter(model => model.id !== 'auto');
  return nonAuto.length ? nonAuto : [primaryModel(models)];
}

function contextWindow(model: CatalogModel): number {
  return model.context_window ?? model.context_length ?? 128_000;
}

function outputLimit(model: CatalogModel): number {
  return Math.min(8192, contextWindow(model));
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function claude(ctx: GenerateContext): Generation {
  const model = primaryModel(ctx.models, ctx.requestedModelId);
  const directory = ctx.profile === 'default'
    ? posixPath(ctx.homeDir, '.claude')
    : posixPath(ctx.homeDir, '.claude', 'profiles', ctx.profile);
  return {
    files: [{
      path: posixPath(directory, 'settings.json'),
      format: 'json',
      sensitive: true,
      value: {
        env: {
          ANTHROPIC_BASE_URL: rootUrl(ctx.url),
          ANTHROPIC_AUTH_TOKEN: ctx.apiKey,
          ANTHROPIC_MODEL: model.id,
          ANTHROPIC_DEFAULT_OPUS_MODEL: model.id,
          ANTHROPIC_DEFAULT_SONNET_MODEL: model.id,
          ANTHROPIC_DEFAULT_HAIKU_MODEL: model.id,
          CLAUDE_CODE_AUTO_COMPACT_WINDOW: String(contextWindow(model)),
          CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: '1',
        },
      },
    }],
    notes: [
      ctx.profile === 'default'
        ? 'Claude Code will read this configuration automatically.'
        : `Launch with CLAUDE_CONFIG_DIR=${directory} claude`,
      'For zero-persistence credentials, prefer: srouter launch',
    ],
  };
}

function codex(ctx: GenerateContext): Generation {
  const model = primaryModel(ctx.models, ctx.requestedModelId);
  const compact = Math.max(16_000, Math.floor(contextWindow(model) * 0.9));
  const providerTable = [
    '[model_providers.srouter]',
    'name = "SRouter"',
    `base_url = ${JSON.stringify(v1Url(ctx.url))}`,
    'wire_api = "responses"',
    'env_key = "SROUTER_API_KEY"',
    'requires_openai_auth = false',
  ];
  // Codex reads exactly one file, ~/.codex/config.toml. Named profiles are
  // `[profiles.NAME]` tables in that same file, selected with
  // `codex --profile NAME`; separate per-profile files are never read.
  const content = ctx.profile === 'default'
    ? [
      '# srouter:start',
      `model = ${JSON.stringify(model.id)}`,
      'model_provider = "srouter"',
      `model_context_window = ${contextWindow(model)}`,
      `model_auto_compact_token_limit = ${compact}`,
      'tool_output_token_limit = 20000',
      '',
      ...providerTable,
      '# srouter:end',
      '',
    ]
    : [
      '# srouter:start',
      ...providerTable,
      '',
      `[profiles.${/^[A-Za-z0-9_-]+$/.test(ctx.profile) ? ctx.profile : JSON.stringify(ctx.profile)}]`,
      `model = ${JSON.stringify(model.id)}`,
      'model_provider = "srouter"',
      '# srouter:end',
      '',
    ];
  return {
    files: [{
      path: posixPath(ctx.homeDir, '.codex', 'config.toml'),
      format: 'toml',
      content: content.join('\n'),
    }],
    notes: [
      'Export SROUTER_API_KEY before running codex; the key is not written to config.toml.',
      ...(ctx.profile === 'default'
        ? []
        : [`Activate this profile with: codex --profile ${ctx.profile}`]),
      `Selected ${model.id} with a ${contextWindow(model)} token context window.`,
    ],
  };
}

function cline(ctx: GenerateContext): Generation {
  const model = primaryModel(ctx.models, ctx.requestedModelId);
  return {
    files: [{
      path: posixPath(ctx.homeDir, '.cline', 'data', 'settings', 'providers.json'),
      format: 'json',
      sensitive: true,
      value: {
        version: 1,
        lastUsedProvider: 'openai-compatible',
        providers: {
          'openai-compatible': {
            settings: {
              provider: 'openai-compatible',
              protocol: 'openai-chat',
              client: 'openai-compatible',
              model: model.id,
              baseUrl: v1Url(ctx.url),
              apiKey: ctx.apiKey,
              contextWindow: contextWindow(model),
              capabilities: ['streaming', 'tools'],
            },
            // The field is required by Cline's persisted schema. Keeping it
            // deterministic makes repeated setup runs idempotent.
            updatedAt: '2026-07-27T00:00:00.000Z',
            tokenSource: 'manual',
          },
        },
      },
    }],
    notes: ['Cline will use the generated OpenAI Compatible provider immediately.'],
  };
}

function continueDev(ctx: GenerateContext): Generation {
  const model = primaryModel(ctx.models, ctx.requestedModelId);
  return {
    files: [{
      path: posixPath(ctx.homeDir, '.continue', 'config.yaml'),
      format: 'yaml',
      content: [
        '# srouter:start',
        'name: SRouter',
        'version: 1.0.0',
        'schema: v1',
        'models:',
        '  - name: SRouter',
        '    provider: openai',
        `    model: ${yamlString(model.id)}`,
        `    apiBase: ${yamlString(v1Url(ctx.url))}`,
        '    apiKey: ${{ secrets.SROUTER_API_KEY }}',
        '    capabilities:',
        '      - tool_use',
        '    defaultCompletionOptions:',
        `      contextLength: ${contextWindow(model)}`,
        '# srouter:end',
        '',
      ].join('\n'),
    },
    // `${{ secrets.NAME }}` is resolved, in order, from the process
    // environment, ~/.continue/.env, <cwd>/.continue/.env and <cwd>/.env
    // before Continue's Hub is consulted. The IDE extensions cannot see the
    // shell environment, so ~/.continue/.env is the one place that serves the
    // CLI and the extensions alike — and it keeps the raw key out of the YAML.
    {
      path: posixPath(ctx.homeDir, '.continue', '.env'),
      format: 'env',
      sensitive: true,
      content: `SROUTER_API_KEY=${ctx.apiKey}\n`,
    }],
    notes: [
      'The key is in ~/.continue/.env (read by the Continue CLI and the IDE extensions); config.yaml references it as a secret.',
      'One-shot check with the CLI (npm install -g @continuedev/cli): cn -p "Say hello"',
    ],
  };
}

function aider(ctx: GenerateContext): Generation {
  const model = primaryModel(ctx.models, ctx.requestedModelId);
  return {
    files: [{
      path: posixPath(ctx.homeDir, '.aider.conf.yml'),
      format: 'yaml',
      sensitive: true,
      content: [
        '# srouter:start',
        `openai-api-base: ${yamlString(v1Url(ctx.url))}`,
        `openai-api-key: ${yamlString(ctx.apiKey)}`,
        `model: ${yamlString(`openai/${model.id}`)}`,
        '# srouter:end',
        '',
      ].join('\n'),
    }],
    notes: [
      `Environment-only alternative: OPENAI_API_BASE=${v1Url(ctx.url)} OPENAI_API_KEY=… aider --model openai/${model.id}`,
    ],
  };
}

// OpenCode resolves `provider/model` refs only against the ids a provider
// declares, so the default model has to be in the `models` map — `auto`, the
// usual default, is filtered out of the plain catalog roster, so it goes back
// at the front. And a provider entry alone is inert: without a top-level
// `model` OpenCode keeps whatever it used before (or nothing on a fresh
// install), so the generated config names the default too.
function opencode(ctx: GenerateContext): Generation {
  const model = primaryModel(ctx.models, ctx.requestedModelId);
  const roster = catalogModels(ctx.models);
  const modelEntries = Object.fromEntries(
    [model, ...roster.filter(entry => entry.id !== model.id)].map(entry => [entry.id, {
      name: entry.name ?? entry.id,
      limit: { context: contextWindow(entry), output: outputLimit(entry) },
    }]),
  );
  return {
    files: [{
      path: posixPath(ctx.homeDir, '.config', 'opencode', 'opencode.json'),
      format: 'json',
      value: {
        $schema: 'https://opencode.ai/config.json',
        model: `srouter/${model.id}`,
        provider: {
          srouter: {
            npm: '@ai-sdk/openai-compatible',
            name: 'SRouter',
            options: {
              baseURL: v1Url(ctx.url),
              apiKey: '{env:SROUTER_API_KEY}',
            },
            models: modelEntries,
          },
        },
      },
    }],
    notes: [
      'Export SROUTER_API_KEY before starting OpenCode.',
      `srouter/${model.id} is now the default model.`,
    ],
  };
}

function goose(ctx: GenerateContext): Generation {
  const model = primaryModel(ctx.models, ctx.requestedModelId);
  // GOOSE_MODEL names the default, so it belongs in the provider's list too;
  // `auto` is filtered out of the plain roster and goes back at the front.
  const roster = catalogModels(ctx.models);
  const models = [model, ...roster.filter(entry => entry.id !== model.id)].map(entry => ({
    name: entry.id,
    context_limit: contextWindow(entry),
  }));
  return {
    files: [
      {
        path: posixPath(
          ctx.homeDir,
          '.config',
          'goose',
          'custom_providers',
          'srouter.json',
        ),
        format: 'json',
        value: {
          name: 'srouter',
          engine: 'openai',
          display_name: 'SRouter',
          description: 'SRouter OpenAI-compatible gateway',
          api_key_env: 'SROUTER_API_KEY',
          base_url: v1Url(ctx.url),
          models,
          supports_streaming: true,
          requires_auth: true,
          dynamic_models: false,
          preserves_thinking: true,
        },
      },
      {
        path: posixPath(ctx.homeDir, '.config', 'goose', 'config.yaml'),
        format: 'yaml',
        content: [
          '# srouter:start',
          'GOOSE_PROVIDER: srouter',
          `GOOSE_MODEL: ${yamlString(model.id)}`,
          '# srouter:end',
          '',
        ].join('\n'),
      },
    ],
    notes: ['Export SROUTER_API_KEY before starting Goose.'],
  };
}

function qwen(ctx: GenerateContext): Generation {
  const model = primaryModel(ctx.models, ctx.requestedModelId);
  const dir = posixPath(ctx.homeDir, '.qwen');
  // Qwen Code looks the selected model up in the provider list and, finding
  // nothing, silently falls back to the FIRST listed model — with `auto`
  // filtered out of the roster that was `fusion`, a multi-model fan-out. The
  // default goes first so the lookup always succeeds.
  const roster = catalogModels(ctx.models);
  const models = [model, ...roster.filter(entry => entry.id !== model.id)].map(entry => ({
    id: entry.id,
    name: entry.name ?? entry.id,
    envKey: 'SROUTER_API_KEY',
    baseUrl: v1Url(ctx.url),
    generationConfig: {
      contextWindowSize: contextWindow(entry),
    },
  }));
  return {
    files: [
      {
        path: posixPath(dir, 'settings.json'),
        format: 'json',
        value: {
          model: { name: model.id },
          modelProviders: {
            openai: {
              protocol: 'openai',
              models,
            },
          },
          security: { auth: { selectedType: 'openai' } },
        },
      },
      {
        path: posixPath(dir, '.env'),
        format: 'env',
        sensitive: true,
        content: `SROUTER_API_KEY=${ctx.apiKey}\n`,
      },
    ],
    notes: [
      `Native Gemini mode is also available at ${rootUrl(ctx.url)}/v1beta with GEMINI_API_KEY.`,
    ],
  };
}

// Roo Code imports a settings file named by `roo-cline.autoImportSettingsPath`
// and makes that file's `currentApiConfigName` the active profile. The VS Code
// extension can use an `openai`-type profile (Roo's "OpenAI Compatible"), but
// the Roo CLI only starts with a provider from its own short list and then
// forces `apiProvider: openrouter` plus the --model onto whatever profile is
// CURRENT — so the CLI is served by a separate import file whose current
// profile is an `openrouter`-type one with the base URL overridden. The two
// stores never meet: the extension reads VS Code settings, the CLI reads
// ~/.vscode-mock/global-storage/global-state.json.
function roo(ctx: GenerateContext): Generation {
  const model = primaryModel(ctx.models, ctx.requestedModelId);
  const importPath = posixPath(ctx.homeDir, '.roo', 'srouter.json');
  const cliImportPath = posixPath(ctx.homeDir, '.roo', 'srouter-cli.json');
  const cliProfile = {
    apiProvider: 'openrouter',
    openRouterBaseUrl: v1Url(ctx.url),
    openRouterApiKey: ctx.apiKey,
    openRouterModelId: model.id,
  };
  return {
    files: [
      {
        path: importPath,
        format: 'json',
        sensitive: true,
        value: {
          providerProfiles: {
            currentApiConfigName: 'srouter',
            apiConfigs: {
              srouter: {
                apiProvider: 'openai',
                openAiBaseUrl: v1Url(ctx.url),
                openAiApiKey: ctx.apiKey,
                openAiModelId: model.id,
                openAiStreamingEnabled: true,
                openAiCustomModelInfo: {
                  contextWindow: contextWindow(model),
                  maxTokens: outputLimit(model),
                  supportsPromptCache: false,
                },
              },
              'srouter-cli': cliProfile,
            },
          },
          globalSettings: {},
        },
      },
      {
        path: cliImportPath,
        format: 'json',
        sensitive: true,
        value: {
          providerProfiles: {
            currentApiConfigName: 'srouter-cli',
            apiConfigs: { 'srouter-cli': cliProfile },
          },
          globalSettings: {},
        },
      },
      // The CLI's own defaults file. `provider` is honoured (it guards against
      // the CLI defaulting to Roo Cloud when a Roo token exists); `model` is
      // shadowed in Roo CLI 0.1.x by the -m flag's built-in default, so -m is
      // still needed on the command line until Roo fixes that.
      {
        path: posixPath(ctx.homeDir, '.roo', 'cli-settings.json'),
        format: 'json',
        value: { provider: 'openrouter', model: model.id },
      },
    ],
    notes: [
      `VS Code: add "roo-cline.autoImportSettingsPath": "${importPath}" to settings.json and reload (or Roo Settings → Import); the srouter profile becomes current.`,
      `Roo CLI: merge {"roo-cline.autoImportSettingsPath": "${cliImportPath}"} into ~/.vscode-mock/global-storage/global-state.json (create it if missing), then:`,
      `  export OPENROUTER_API_KEY=<unified-key>   # the CLI refuses to start without it, even with the key in the profile`,
      `  roo -m ${model.id} "Say hello"            # -m is required: the CLI's built-in default model shadows cli-settings.json`,
    ],
  };
}

function kilo(ctx: GenerateContext): Generation {
  const model = primaryModel(ctx.models, ctx.requestedModelId);
  // Kilo refuses to start (`Model not found: openai-compatible/auto`) unless
  // the selected model is in the provider's map, so the default goes first.
  const roster = catalogModels(ctx.models);
  const models = Object.fromEntries([model, ...roster.filter(entry => entry.id !== model.id)].map(entry => [
    entry.id,
    {
      name: entry.name ?? entry.id,
      tool_call: true,
      limit: {
        context: contextWindow(entry),
        output: outputLimit(entry),
      },
    },
  ]));
  return {
    files: [{
      path: posixPath(ctx.homeDir, '.config', 'kilo', 'kilo.jsonc'),
      format: 'json',
      value: {
        $schema: 'https://app.kilo.ai/config.json',
        model: `openai-compatible/${model.id}`,
        provider: {
          'openai-compatible': {
            options: {
              apiKey: '{env:SROUTER_API_KEY}',
              baseURL: v1Url(ctx.url),
            },
            models,
          },
        },
      },
    }],
    notes: [
      'Export SROUTER_API_KEY before starting Kilo; global config is trusted for {env:…} expansion.',
      `One-shot check: kilo run "Say hello" — openai-compatible/${model.id} is the default model.`,
    ],
  };
}

// Crush picks its provider by the top-level `models.large` / `models.small`
// selection, and with neither set it auto-detects from whatever credentials
// are on the machine (an AWS profile, ANTHROPIC_API_KEY, a Charm login) — a
// provider entry alone never gets used. Both slots are pointed at the chosen
// model, which therefore has to be in the provider's list; `auto` is filtered
// out of the plain roster, so it goes back at the front.
function crush(ctx: GenerateContext): Generation {
  const model = primaryModel(ctx.models, ctx.requestedModelId);
  const roster = catalogModels(ctx.models);
  const models = [model, ...roster.filter(entry => entry.id !== model.id)].map(entry => ({
    id: entry.id,
    name: entry.name ?? entry.id,
    cost_per_1m_in: 0,
    cost_per_1m_out: 0,
    cost_per_1m_in_cached: 0,
    cost_per_1m_out_cached: 0,
    context_window: contextWindow(entry),
    default_max_tokens: outputLimit(entry),
    can_reason: false,
    supports_attachments: false,
  }));
  return {
    files: [{
      path: posixPath(ctx.homeDir, '.config', 'crush', 'crush.json'),
      format: 'json',
      value: {
        $schema: 'https://charm.land/crush.json',
        models: {
          large: { provider: 'srouter', model: model.id },
          small: { provider: 'srouter', model: model.id },
        },
        providers: {
          srouter: {
            name: 'SRouter',
            type: 'openai-compat',
            base_url: v1Url(ctx.url),
            api_key: '$SROUTER_API_KEY',
            models,
          },
        },
      },
    }],
    notes: [
      'Export SROUTER_API_KEY before starting Crush.',
      `srouter/${model.id} is now the large and small model.`,
    ],
  };
}

// DeepSeek Harness (dsh) reads one YAML settings document, $DSH_HOME/settings.yaml
// (default ~/.dsh). Every provider is a route under `llm-pi-ai.providers`;
// a route pi-ai's installed catalog does not ship must spell out `api`,
// `baseURL`, and a non-empty `models` list, which is exactly what a gateway
// with a per-user live catalog is. The key travels through `apiKeyEnv`:
// DSH loads $DSH_HOME/.env as its user environment layer, so writing the key
// there (0600) makes the route work on the next request without an export.
// No `compat` switches: the gateway already maps `developer` → `system` and
// honours `max_completion_tokens`, the two things pi-ai sends to an endpoint
// it cannot recognize.
function dsh(ctx: GenerateContext): Generation {
  const model = primaryModel(ctx.models, ctx.requestedModelId);
  // DSH_HOME relocates the whole harness home; nothing else about the
  // layout changes, so honour it the way dsh itself does.
  const home = process.env.DSH_HOME?.trim() || posixPath(ctx.homeDir, '.dsh');
  // A route id is permanent in DSH (sessions, defaults, and credential refs
  // name it) and must be lowercase; a named profile becomes a second route
  // beside the default one rather than replacing it.
  const route = ctx.profile === 'default'
    ? 'srouter'
    : `srouter-${ctx.profile.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
  const roster = catalogModels(ctx.models);
  const entries = [model, ...roster.filter(entry => entry.id !== model.id)]
    .map(entry => ({
      id: entry.id,
      name: entry.name ?? entry.id,
      contextWindow: contextWindow(entry),
      maxTokens: outputLimit(entry),
    }));
  return {
    files: [
      {
        path: posixPath(home, 'settings.yaml'),
        format: 'yaml',
        value: {
          'llm-pi-ai': {
            providers: {
              [route]: {
                displayName: ctx.profile === 'default' ? 'SRouter' : `SRouter (${ctx.profile})`,
                apiKeyEnv: 'SROUTER_API_KEY',
                api: 'openai-completions',
                baseURL: v1Url(ctx.url),
                models: entries,
              },
            },
          },
          // The default model is only claimed for the default profile; a
          // named route is an extra option in the picker, not a takeover.
          // A previous default's `reasoningEffort` must go with it: DSH
          // refuses a request naming a level the selected model cannot
          // take, and a hand-declared model declares none.
          ...(ctx.profile === 'default'
            ? {
              'agent-default-model': {
                provider: route,
                model: model.id,
                reasoningEffort: undefined,
              },
            }
            : {}),
        },
      },
      {
        path: posixPath(home, '.env'),
        format: 'env',
        sensitive: true,
        content: `SROUTER_API_KEY=${ctx.apiKey}\n`,
      },
    ],
    notes: [
      `Start DeepSeek Harness with: npx @deepseek-ai/dsh web — ${route}/${model.id} is ${ctx.profile === 'default' ? 'the default model' : 'in the model picker'}.`,
      'One-shot check: npx @deepseek-ai/dsh --profile headless "Say hello"',
      'Settings are hot-reloaded, so a running dsh picks this up on its next request.',
      `Models are declared text-only; give a vision model \`input: [text, image]\` under ${route}.models in settings.yaml to send it images.`,
    ],
  };
}

// MiMo Code is an OpenCode derivative, so the config is the same shape as the
// OpenCode one above: a custom `provider` entry backed by the AI SDK's
// openai-compatible package, with credentials as `options.apiKey` /
// `options.baseURL` (mimo.xiaomi.com/mimocode/models-provider). Two things
// differ from OpenCode and both matter:
//   * the file lives in MiMo's own global config directory. That is
//     `$XDG_CONFIG_HOME/mimocode` (`~/.config/mimocode` on macOS and Linux),
//     relocated wholesale to `$MIMOCODE_HOME/config` when that is set. The
//     directory accepts `config.json`, `mimocode.json` and `mimocode.jsonc`
//     and merges them in that order, so writing `config.json` — the first and
//     weakest layer — leaves a hand-written `mimocode.json` in charge.
//   * `provider.<id>.models.<id>.limit` requires BOTH `context` and `output`
//     in MiMo's schema, the same as OpenCode's (https://opencode.ai/config.json).
// There is no MIMOCODE_API_KEY or MIMOCODE_BASE_URL: MiMo's environment
// variables locate resources and toggle features, they are not a fallback for
// config fields. The key travels through the config file's own `{env:VAR}`
// substitution instead, which keeps it off disk.
function mimo(ctx: GenerateContext): Generation {
  const model = primaryModel(ctx.models, ctx.requestedModelId);
  const configDir = process.env.MIMOCODE_HOME?.trim()
    ? posixPath(process.env.MIMOCODE_HOME.trim(), 'config')
    : posixPath(
      process.env.XDG_CONFIG_HOME?.trim() || posixPath(ctx.homeDir, '.config'),
      'mimocode',
    );
  // The default model is named as `srouter/<id>`, so it has to exist in the
  // provider's own `models` map — `auto`, the usual default, is filtered out
  // of the plain catalog roster, so put the chosen model back at the front.
  const roster = catalogModels(ctx.models);
  const modelEntries = Object.fromEntries(
    [model, ...roster.filter(entry => entry.id !== model.id)].map(entry => [entry.id, {
      name: entry.name ?? entry.id,
      limit: { context: contextWindow(entry), output: outputLimit(entry) },
    }]),
  );
  return {
    files: [{
      path: posixPath(configDir, 'config.json'),
      format: 'json',
      value: {
        $schema: 'https://mimo.xiaomi.com/mimocode/config.json',
        provider: {
          srouter: {
            npm: '@ai-sdk/openai-compatible',
            name: 'SRouter',
            options: {
              baseURL: v1Url(ctx.url),
              apiKey: '{env:SROUTER_API_KEY}',
            },
            models: modelEntries,
          },
        },
        model: `srouter/${model.id}`,
      },
    }],
    notes: [
      'Install MiMo Code with: curl -fsSL https://mimo.xiaomi.com/install | bash',
      'Export SROUTER_API_KEY before starting MiMo Code.',
      `Start it with \`mimo\` — srouter/${model.id} is the default model.`,
      'One-shot check: mimo run "Say hello"',
    ],
  };
}

// OpenClaw reads one JSON5 document, $OPENCLAW_CONFIG_PATH (default
// ~/.openclaw/openclaw.json, the state dir being relocatable through
// OPENCLAW_STATE_DIR / OPENCLAW_HOME). Every model endpoint is an entry under
// `models.providers`, and a provider its bundled catalog does not know must
// spell out `baseUrl`, `api` and a non-empty `models` list — exactly what a
// gateway with a per-user live catalog is. `api: openai-completions` is the
// adapter for a /v1/chat/completions backend; OpenClaw already strips the
// developer role and attribution headers for a custom origin, so no `compat`
// switches are needed. The key travels as `${SROUTER_API_KEY}`, OpenClaw's
// own env substitution, and the value lands in $OPENCLAW_STATE_DIR/.env (0600),
// the global env file OpenClaw loads on its own — so the route works with
// nothing exported. The default model is `srouter/<id>` under
// `agents.defaults.model.primary`; the patch keeps any `fallbacks` already
// declared beside it.
function openclawStateDir(homeDir: string): string {
  return process.env.OPENCLAW_STATE_DIR?.trim()
    || posixPath(process.env.OPENCLAW_HOME?.trim() || homeDir, '.openclaw');
}

function openclaw(ctx: GenerateContext): Generation {
  const model = primaryModel(ctx.models, ctx.requestedModelId);
  const stateDir = openclawStateDir(ctx.homeDir);
  const configPath = process.env.OPENCLAW_CONFIG_PATH?.trim()
    || posixPath(stateDir, 'openclaw.json');
  // A provider id is referenced by every model ref (`<provider>/<model>`) and
  // by session state, so it is permanent; a named profile becomes a second
  // provider beside the default one rather than replacing it.
  const provider = ctx.profile === 'default'
    ? 'srouter'
    : `srouter-${ctx.profile.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
  const roster = catalogModels(ctx.models);
  const entries = [model, ...roster.filter(entry => entry.id !== model.id)]
    .map(entry => ({
      id: entry.id,
      name: entry.name ?? entry.id,
      reasoning: false,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: contextWindow(entry),
      maxTokens: outputLimit(entry),
    }));
  return {
    files: [
      {
        path: configPath,
        format: 'json',
        value: {
          ...(ctx.profile === 'default'
            ? { agents: { defaults: { model: { primary: `${provider}/${model.id}` } } } }
            : {}),
          models: {
            providers: {
              [provider]: {
                baseUrl: v1Url(ctx.url),
                apiKey: '${SROUTER_API_KEY}',
                api: 'openai-completions',
                // OpenClaw attaches its own `openclaw/<version>` identity only
                // to endpoints it recognises; a custom origin gets the bare
                // openai-node SDK user agent, which the gateway's analytics
                // would file under "openai-sdk". A static provider header
                // (verified to reach chat requests) names the client instead.
                headers: { 'User-Agent': 'openclaw' },
                models: entries,
              },
            },
          },
        },
      },
      {
        path: posixPath(stateDir, '.env'),
        format: 'env',
        sensitive: true,
        content: `SROUTER_API_KEY=${ctx.apiKey}\n`,
      },
    ],
    notes: [
      'Install OpenClaw with: npm install -g openclaw@latest --allow-scripts=openclaw',
      `Try it without the gateway daemon: openclaw agent exec --model ${provider}/${model.id} "Say hello"`,
      ctx.profile === 'default'
        ? `${provider}/${model.id} is the default model; a running \`openclaw gateway\` needs a restart to pick the change up.`
        : `${provider}/${model.id} is in the model picker; the default model is unchanged.`,
      `Models are declared text-only; give a vision model \`input: ["text", "image"]\` under models.providers.${provider} to send it images.`,
    ],
  };
}

// Hermes Agent (Nous Research) reads one YAML document, $HERMES_HOME/config.yaml
// (default ~/.hermes), and treats it as the single source of truth for the
// endpoint: OPENAI_BASE_URL is deliberately ignored for anything but
// api.openai.com, and OPENAI_API_KEY is only sent to OpenAI hosts. So the
// gateway goes into the `model` block as `provider: custom` with `base_url`,
// and the key travels as `api_key: "${SROUTER_API_KEY}"` — Hermes's own
// substitution — with the value in $HERMES_HOME/.env (0600), the file Hermes
// loads on its own, so nothing needs exporting. A fresh install ships
// `model: ""` (a "not configured" sentinel); replacing it with the mapping is
// exactly what `hermes setup` would do, and it is what lets a headless first
// run skip the wizard. A named profile becomes an entry in the `providers`
// dict instead — picked with `/model custom:<name>:<model>` — leaving the
// default model alone.
function hermes(ctx: GenerateContext): Generation {
  const model = primaryModel(ctx.models, ctx.requestedModelId);
  const home = process.env.HERMES_HOME?.trim() || posixPath(ctx.homeDir, '.hermes');
  const provider = `srouter-${ctx.profile.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
  // Hermes only identifies itself to hosts it knows; a custom endpoint gets the
  // bare openai-python user agent. `default_headers` is its documented way to
  // override that, and it is what lets the gateway's analytics name the client.
  const headers = { 'User-Agent': 'hermes-agent' };
  const value: Record<string, unknown> = ctx.profile === 'default'
    ? {
      model: {
        provider: 'custom',
        default: model.id,
        base_url: v1Url(ctx.url),
        api_key: '${SROUTER_API_KEY}',
        api_mode: 'chat_completions',
        context_length: contextWindow(model),
        default_headers: headers,
        // The wizard strips these when it writes api_key; a leftover would
        // point the key lookup at a variable this route never sets.
        key_env: undefined,
        api_key_env: undefined,
      },
    }
    : {
      providers: {
        [provider]: {
          name: `SRouter (${ctx.profile})`,
          api: v1Url(ctx.url),
          api_key: '${SROUTER_API_KEY}',
          transport: 'chat_completions',
          default_model: model.id,
          context_length: contextWindow(model),
          extra_headers: headers,
        },
      },
    };
  return {
    files: [
      { path: posixPath(home, 'config.yaml'), format: 'yaml', value },
      {
        path: posixPath(home, '.env'),
        format: 'env',
        sensitive: true,
        content: `SROUTER_API_KEY=${ctx.apiKey}\n`,
      },
    ],
    notes: [
      'Install Hermes Agent with: curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --skip-setup',
      ctx.profile === 'default'
        ? `Try it with: hermes -z "Say hello" — custom/${model.id} is the default model.`
        : `Pick it inside a chat with: /model custom:${provider}:${model.id} — the default model is unchanged.`,
      'A running `hermes gateway` (Telegram, Discord, …) needs a restart to pick the change up.',
    ],
  };
}

// Pi (pi.dev, @earendil-works/pi-coding-agent) keeps user configuration in its
// agent directory, $PI_CODING_AGENT_DIR (default ~/.pi/agent). An endpoint Pi
// does not ship is a provider entry in models.json — `baseUrl`, `api` and the
// `models` it serves — and `api: openai-completions` is the adapter for a
// /v1/chat/completions backend. Pi does not load a .env file of its own, so the
// key is written literally (the file is created 0600); its `$NAME` form would
// need the variable exported in every shell that starts Pi. A provider entry
// alone only adds models to `/model`: the startup choice is `defaultProvider`
// plus `defaultModel` in settings.json, which a named profile leaves alone.
function piAgentDir(homeDir: string): string {
  return process.env.PI_CODING_AGENT_DIR?.trim() || posixPath(homeDir, '.pi', 'agent');
}

function pi(ctx: GenerateContext): Generation {
  const model = primaryModel(ctx.models, ctx.requestedModelId);
  const dir = piAgentDir(ctx.homeDir);
  const provider = ctx.profile === 'default'
    ? 'srouter'
    : `srouter-${ctx.profile.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
  const roster = catalogModels(ctx.models);
  const entries = [model, ...roster.filter(entry => entry.id !== model.id)]
    .map(entry => ({
      id: entry.id,
      name: entry.name ?? entry.id,
      // The gateway picks the upstream per request, so no model can promise a
      // thinking API; Pi then sends no reasoning effort at all.
      reasoning: false,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: contextWindow(entry),
      maxTokens: outputLimit(entry),
    }));
  const files: Generation['files'] = [{
    path: posixPath(dir, 'models.json'),
    format: 'json',
    sensitive: true,
    value: {
      providers: {
        [provider]: {
          name: ctx.profile === 'default' ? 'SRouter' : `SRouter (${ctx.profile})`,
          baseUrl: v1Url(ctx.url),
          api: 'openai-completions',
          apiKey: ctx.apiKey,
          // Pi names itself only to a few hosts it knows; a custom endpoint gets
          // the bare openai-node SDK user agent, which the gateway's analytics
          // would file under "openai-sdk". This is the UA Pi already sends to
          // Cloudflare, so analytics can name the client.
          headers: { 'User-Agent': 'pi-coding-agent' },
          models: entries,
        },
      },
    },
  }];
  if (ctx.profile === 'default') {
    files.push({
      path: posixPath(dir, 'settings.json'),
      format: 'json',
      value: { defaultProvider: provider, defaultModel: model.id },
    });
  }
  return {
    files,
    notes: [
      'Install Pi with: npm install -g @earendil-works/pi-coding-agent (or curl -fsSL https://pi.dev/install.sh | sh)',
      ctx.profile === 'default'
        ? `Try it with: pi -p "Say hello" — ${provider}/${model.id} is the default model.`
        : `Try it with: pi --model ${provider}/${model.id} -p "Say hello" — the default model is unchanged.`,
      'Every catalog model is in /model; a running Pi session picks the change up when /model is opened.',
      `Models are declared text-only; give a vision model \`input: ["text", "image"]\` under providers.${provider} in models.json to send it images.`,
    ],
  };
}

// Reasonix (reasonix.io, esengine/DeepSeek-Reasonix) reads one global TOML
// document, <Reasonix home>/config.toml — ~/.reasonix, %APPDATA%\reasonix on
// Windows, or $REASONIX_HOME when set. Every endpoint is a `[[providers]]`
// entry; `kind = "openai"` posts to `<base_url>/chat/completions`, and a
// `models` list exposes the whole catalog under one connection. The entry only
// names its key variable (`api_key_env`); Reasonix keeps the value in the .env
// beside config.toml (0600) and reads it on its own, so nothing needs
// exporting. `default_model` is `provider/model`. Reasonix already sends
// `User-Agent: Reasonix/<version>` to every endpoint, so no header is needed.
function reasonixHome(homeDir: string): string {
  if (process.env.REASONIX_HOME?.trim()) return process.env.REASONIX_HOME.trim();
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA?.trim() || path.join(homeDir, 'AppData', 'Roaming'), 'reasonix');
  }
  return path.join(homeDir, '.reasonix');
}

function reasonix(ctx: GenerateContext): Generation {
  const model = primaryModel(ctx.models, ctx.requestedModelId);
  const home = reasonixHome(ctx.homeDir);
  // A provider name is what every `provider/model` ref and saved session points
  // at, so a named profile becomes a second entry rather than replacing it.
  const provider = ctx.profile === 'default'
    ? 'srouter'
    : `srouter-${ctx.profile.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
  const roster = catalogModels(ctx.models);
  const models = [model, ...roster.filter(entry => entry.id !== model.id)].map(entry => entry.id);
  return {
    files: [
      {
        path: path.join(home, 'config.toml'),
        format: 'toml',
        content: [
          ...(ctx.profile === 'default' ? [`default_model = ${JSON.stringify(`${provider}/${model.id}`)}`, ''] : []),
          '[[providers]]',
          `name = ${JSON.stringify(provider)}`,
          `display_name = ${JSON.stringify(ctx.profile === 'default' ? 'SRouter' : `SRouter (${ctx.profile})`)}`,
          'kind = "openai"',
          `base_url = ${JSON.stringify(v1Url(ctx.url))}`,
          `models = [${models.map(id => JSON.stringify(id)).join(', ')}]`,
          `default = ${JSON.stringify(model.id)}`,
          'api_key_env = "SROUTER_API_KEY"',
          `context_window = ${contextWindow(model)}`,
          // Without a price Reasonix bills unknown models at a guessed rate;
          // the gateway's models are free.
          'price = { cache_hit = 0, input = 0, output = 0, currency = "$" }',
        ].join('\n'),
      },
      {
        path: path.join(home, '.env'),
        format: 'env',
        sensitive: true,
        content: `SROUTER_API_KEY=${ctx.apiKey}\n`,
      },
    ],
    notes: [
      'Install Reasonix with: npm install -g reasonix (or brew install esengine/reasonix/reasonix)',
      ctx.profile === 'default'
        ? `Try it with: reasonix -p "Say hello" — ${provider}/${model.id} is the default model.`
        : `Try it with: reasonix --model ${provider}/${model.id} -p "Say hello" — the default model is unchanged.`,
      `Every catalog model is in /model as ${provider}/<id>; other [[providers]] entries in config.toml are kept.`,
      `Reasonix Studio lists only the providers in [desktop].provider_access when that list is set; add "${provider}" there, or under Settings → Model → Access.`,
    ],
  };
}

function cursor(_ctx: GenerateContext): Generation {
  return {
    files: [],
    notes: [
      'Cursor sends model traffic through its cloud service, so localhost is not reachable from Cursor.',
      `Expose the gateway through a trusted HTTPS tunnel, then open Cursor Settings → Models, enable Override OpenAI Base URL, and enter <public-url>/v1.`,
      'Cursor only documents custom keys for standard chat models; custom base-URL overrides may not support Responses-based or built-in models.',
      'The override affects Cursor globally while enabled, so disable it before switching back to built-in providers.',
      'Use a separately revocable URL token if the client cannot set an Authorization header.',
    ],
  };
}

function zed(ctx: GenerateContext): Generation {
  return {
    files: [],
    notes: [
      'Zed is a high-performance editor built in Rust with real-time multi-agent collaboration.',
      'Zed speaks the OpenAI chat API directly, so connect it as an OpenAI-compatible assistant provider.',
      `Set the base URL to ${v1Url(ctx.url)} and the API key to your unified key.`,
      'Zed reads models from the endpoint on connect, so the catalog appears in its model picker automatically.',
    ],
  };
}

function jetbrains(ctx: GenerateContext): Generation {
  return {
    files: [],
    notes: [
      'JetBrains AI Assistant works across IntelliJ IDEA, Rider, WebStorm, PyCharm and the rest of the family.',
      'Point the assistant at this gateway as an OpenAI-compatible custom endpoint.',
      `Set the base URL to ${v1Url(ctx.url)} and the API key to your unified key.`,
      'The IDE fetches the model list from the endpoint, so your catalog shows up in the model dropdown.',
    ],
  };
}

function openclaude(ctx: GenerateContext): Generation {
  return {
    files: [],
    notes: [
      'OpenClaude is a Claude-compatible CLI that routes through an OpenAI-compatible gateway.',
      `Set OPENAI_BASE_URL=${v1Url(ctx.url)} and OPENAI_API_KEY to your unified key.`,
      'OpenClaude then speaks Claude-style tool calls through the gateway, which translates them to the upstream provider.',
    ],
  };
}

function atomcode(ctx: GenerateContext): Generation {
  return {
    files: [],
    notes: [
      'AtomCode is an extension for Atom IDE that integrates with OpenAI-compatible gateways.',
      `Set the base URL to ${v1Url(ctx.url)} and the API key to your unified key.`,
      'AtomCode fetches models from the gateway automatically.',
    ],
  };
}

function ohMyPi(ctx: GenerateContext): Generation {
  const model = primaryModel(ctx.models, ctx.requestedModelId);
  const dir = posixPath(ctx.homeDir, '.omp', 'agent');
  const provider = ctx.profile === 'default'
    ? 'srouter'
    : `srouter-${ctx.profile.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
  const files: Generation['files'] = [{
    path: posixPath(dir, 'models.yml'),
    format: 'yaml',
    sensitive: true,
    value: {
      providers: {
        [provider]: {
          baseUrl: v1Url(ctx.url),
          apiKey: ctx.apiKey,
          api: 'openai-completions',
          // The gateway exposes GET /v1/models, so discovery fills the picker
          // with the live catalog instead of a hand-written model list.
          discovery: { type: 'openai-models-list' },
        },
      },
    },
  }];
  if (ctx.profile === 'default') {
    files.push({
      path: posixPath(dir, 'config.yml'),
      format: 'yaml',
      value: { modelRoles: { default: `${provider}/${model.id}` } },
    });
  }
  return {
    files,
    notes: [
      'Install Oh My Pi: curl -fsSL https://omp.sh/install | sh (or bun install -g @oh-my-pi/pi-coding-agent).',
      `~/.omp/agent/models.yml gains a ${provider} provider; other providers in it are kept.`,
      ctx.profile === 'default'
        ? `modelRoles.default points at ${provider}/${model.id}; run omp — discovery fills /model with every gateway model.`
        : `Run omp and pick ${provider}/${model.id} in /model (the default model is unchanged).`,
      'One-shot check: omp -p "Say hello".',
    ],
  };
}

function factoryDroid(ctx: GenerateContext): Generation {
  const model = primaryModel(ctx.models, ctx.requestedModelId);
  return {
    files: [{
      path: posixPath(ctx.homeDir, '.factory', 'settings.json'),
      format: 'json',
      sensitive: true,
      value: {
        customModels: [{
          model: model.id,
          displayName: model.name ?? model.id,
          baseUrl: v1Url(ctx.url),
          apiKey: ctx.apiKey,
          provider: 'generic-chat-completion-api',
        }],
      },
    }],
    notes: [
      'Install Droid: curl -fsSL https://app.factory.ai/cli | sh (or npm install -g droid).',
      'Other keys in ~/.factory/settings.json are kept, but its customModels array is replaced with this entry — re-add any other custom models you had.',
      `Choose custom:${model.id} in /model to route the session through the gateway.`,
      'settings.json is watched, so a running droid session picks the change up without a restart.',
    ],
  };
}

function generic(ctx: GenerateContext): Generation {
  const model = primaryModel(ctx.models, ctx.requestedModelId);
  return {
    files: [],
    notes: [
      `OPENAI_BASE_URL=${v1Url(ctx.url)}`,
      `OPENAI_API_KEY=${ctx.apiKey || '<unified-key>'}`,
      `OPENAI_MODEL=${model.id}`,
      `curl ${v1Url(ctx.url)}/chat/completions -H "Authorization: Bearer $OPENAI_API_KEY" -H "Content-Type: application/json" -d '{"model":"${model.id}","messages":[{"role":"user","content":"Hello"}]}'`,
    ],
  };
}

const metadata = [
  ['claude', 'Claude Code', 'code', 'file', 'Anthropic Messages', 'root', 'setup-claude', 'https://docs.anthropic.com/en/docs/claude-code', 'default', claude],
  ['codex', 'Codex CLI', 'code', 'file', 'OpenAI Responses', '/v1', 'setup-codex', 'https://developers.openai.com/codex', 'default', codex],
  ['cline', 'Cline', 'code', 'file', 'OpenAI Chat', '/v1', 'setup-cline', 'https://docs.cline.bot', 'default', cline],
  ['continue', 'Continue', 'code', 'file', 'OpenAI Chat', '/v1', 'setup-continue', 'https://docs.continue.dev', 'default', continueDev],
  ['aider', 'Aider', 'code', 'file', 'OpenAI Chat', '/v1', 'setup-aider', 'https://aider.chat/docs', 'default', aider],
  ['opencode', 'OpenCode', 'code', 'file', 'OpenAI Chat', '/v1', 'setup-opencode', 'https://opencode.ai/docs', 'full', opencode],
  ['goose', 'Goose', 'agent', 'file', 'OpenAI Chat', '/v1', 'setup-goose', 'https://block.github.io/goose', 'full', goose],
  ['qwen', 'Qwen Code', 'code', 'file', 'OpenAI or Gemini', '/v1', 'setup-qwen', 'https://qwenlm.github.io/qwen-code-docs', 'full', qwen],
  ['roo', 'Roo Code', 'code', 'file', 'OpenAI Chat', '/v1', 'setup-roo', 'https://docs.roocode.com', 'default', roo],
  ['kilo', 'Kilo Code', 'code', 'file', 'OpenAI Chat', '/v1', 'setup-kilo', 'https://kilocode.ai/docs', 'default', kilo],
  ['crush', 'Crush', 'code', 'file', 'OpenAI Chat', '/v1', 'setup-crush', 'https://github.com/charmbracelet/crush', 'default', crush],
  ['dsh', 'DeepSeek Harness', 'agent', 'file', 'OpenAI Chat', '/v1', 'setup-dsh', 'https://github.com/deepseek-ai/deepseek-harness', 'full', dsh],
  ['mimo', 'MiMo Code', 'code', 'file', 'OpenAI Chat', '/v1', 'setup-mimo', 'https://mimo.xiaomi.com/mimocode', 'full', mimo],
  ['omp', 'Oh My Pi', 'code', 'file', 'OpenAI Chat', '/v1', 'setup-omp', 'https://omp.sh/docs/providers', 'default', ohMyPi],
  ['openclaw', 'OpenClaw', 'agent', 'file', 'OpenAI Chat', '/v1', 'setup-openclaw', 'https://docs.openclaw.ai/gateway/config-tools/custom-providers', 'default', openclaw],
  ['hermes', 'Hermes Agent', 'agent', 'file', 'OpenAI Chat', '/v1', 'setup-hermes', 'https://hermes-agent.nousresearch.com/docs/', 'full', hermes],
  ['pi', 'Pi', 'code', 'file', 'OpenAI Chat', '/v1', 'setup-pi', 'https://pi.dev/docs/latest/models', 'default', pi],
  ['reasonix', 'Reasonix', 'code', 'file', 'OpenAI Chat', '/v1', 'setup-reasonix', 'https://github.com/esengine/DeepSeek-Reasonix/blob/studio/docs/CLI.md#configure-providers', 'default', reasonix],
  ['droid', 'Factory Droid', 'code', 'file', 'OpenAI Chat', '/v1', 'setup-droid', 'https://docs.factory.ai/droid-cli/quickstart', 'default', factoryDroid],
  ['cursor', 'Cursor', 'code', 'guide', 'OpenAI Chat', '/v1', 'setup-cursor', 'https://docs.cursor.com', 'default', cursor],
  ['zed', 'Zed', 'code', 'guide', 'OpenAI Chat', '/v1', 'setup-zed', 'https://zed.dev/docs', 'default', zed],
  ['jetbrains', 'JetBrains', 'code', 'guide', 'OpenAI Chat', '/v1', 'setup-jetbrains', 'https://www.jetbrains.com/help/ai/ai-assistant.html', 'default', jetbrains],
  ['openclaude', 'OpenClaude', 'code', 'file', 'OpenAI Chat', '/v1', 'setup-openclaude', 'https://openclaude.twigpine.com/docs/quickstart/', 'default', openclaude],
  ['atomcode', 'AtomCode', 'code', 'file', 'OpenAI Chat', '/v1', 'setup-atomcode', 'https://atom.io', 'default', atomcode],
  ['generic', 'Generic OpenAI client', 'agent', 'guide', 'OpenAI Chat', '/v1', 'setup-generic', 'https://platform.openai.com/docs/api-reference/chat', 'default', generic],
] as const;

export const tools: ToolDefinition[] = metadata.map(([
  id,
  name,
  category,
  configType,
  protocol,
  baseUrlSupport,
  command,
  docsUrl,
  modelBehavior,
  generate,
]) => ({
  id,
  name,
  category,
  configType,
  protocol,
  baseUrlSupport,
  command,
  docsUrl,
  modelBehavior,
  generate,
}));

export function getTool(id: string): ToolDefinition | undefined {
  return tools.find(tool => tool.id === id);
}
