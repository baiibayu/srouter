import { OpenAICompatProvider } from './openai-compat.js';
import { isAnonymousCredential } from '../lib/credential.js';
import type { ChatMessage, ChatCompletionResponse, ChatToolCall } from '@baiibayu/srouter-shared/types.js';
import type { CompletionOptions, KeyValidationResult } from './base.js';
import type { QuotaObservationContext } from '../services/provider-quota.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Cline API (api.cline.bot) - OpenAI-compatible interface at api.cline.bot/api/v1.
 *
 * Supports dual-mode:
 * 1. Keyless operation with rotating free models (cline-free/*, openrouter/free).
 * 2. Account-authenticated mode with personal token / WorkOS OAuth or local CLI detection.
 *
 * Upstream protocol note:
 * Cline's API only implements streaming (streamText). A non-streaming request
 * returns "generateText is not implemented". SRouter forces stream:true upstream
 * and aggregates chunks for non-streaming callers.
 */
export class ClineProvider extends OpenAICompatProvider {
  constructor() {
    super({
      platform: 'cline',
      name: 'Cline',
      baseUrl: 'https://api.cline.bot/api/v1',
      keyless: false, // Requires OAuth or personal WorkOS token
    });
  }

  private getLocalToken(): string | null {
    try {
      const provPath = path.join(os.homedir(), '.cline', 'data', 'settings', 'providers.json');
      if (fs.existsSync(provPath)) {
        const data = JSON.parse(fs.readFileSync(provPath, 'utf8'));
        const token = data?.providers?.cline?.settings?.auth?.accessToken;
        if (token && typeof token === 'string') return token.trim();
      }
    } catch {}
    try {
      const secPath = path.join(os.homedir(), '.cline', 'data', 'secrets.json');
      if (fs.existsSync(secPath)) {
        const sec = JSON.parse(fs.readFileSync(secPath, 'utf8'));
        const acc = sec?.['cline:clineAccountId'];
        if (acc) {
          const parsed = typeof acc === 'string' ? JSON.parse(acc) : acc;
          if (parsed?.idToken) return `workos:${parsed.idToken}`;
        }
      }
    } catch {}
    return null;
  }

  protected override authHeader(apiKey: string): Record<string, string> {
    const headers: Record<string, string> = {
      'HTTP-Referer': 'https://cline.bot',
      'X-Title': 'Cline',
      'User-Agent': 'Cline/3.8.0',
      'X-PLATFORM': process.platform || 'win32',
      'X-PLATFORM-VERSION': process.version || 'v22.22.3',
      'X-CLIENT-TYPE': 'extension',
      'X-CLIENT-VERSION': '3.8.0',
      'X-CORE-VERSION': '3.8.0',
      'X-IS-MULTIROOT': 'false',
    };
    let token = apiKey;
    if (isAnonymousCredential(apiKey)) {
      const localToken = this.getLocalToken();
      if (localToken) {
        token = localToken;
      } else {
        // Pure keyless: do not send dummy Bearer so upstream accepts free endpoints
        return headers;
      }
    }
    let trimmed = token.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        trimmed = (parsed.accessToken || trimmed).trim();
      } catch {}
    }
    const formatted = trimmed.toLowerCase().startsWith('workos:')
      ? trimmed
      : (/^eyJ/.test(trimmed) ? `workos:${trimmed}` : trimmed);
    if (formatted) {
      headers['Authorization'] = `Bearer ${formatted}`;
    }
    return headers;
  }

  customHeaders(apiKey: string): Record<string, string> {
    return this.authHeader(apiKey);
  }

  override async fetchModelCatalog(_apiKey: string): Promise<Response> {
    // Official verified free and catalog models supported on Cline upstream
    const verifiedModels = [
      { id: 'cline-free/deepseek-v4.1-flash', object: 'model' },
      { id: 'cline-free/mimo-v2.6-flash', object: 'model' },
      { id: 'cline-free/muse-spark-1.3-contributor', object: 'model' },
      { id: 'openrouter/free', object: 'model' },
      { id: 'stealth/space-bunny-alpha', object: 'model' },
      { id: 'deepseek/deepseek-v4-flash', object: 'model' },
      { id: 'stepfun/step-3.7-flash', object: 'model' },
      { id: 'minimax/minimax-m3', object: 'model' },
      { id: 'z-ai/glm-5.2', object: 'model' },
      { id: 'deepseek/deepseek-v4.1-flash-1017', object: 'model' },
      { id: 'qwen/qwen3.8-flash', object: 'model' },
    ];
    return new Response(JSON.stringify({ object: 'list', data: verifiedModels }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  override async validateKey(apiKey: string, _quotaContext?: QuotaObservationContext): Promise<KeyValidationResult> {
    if (isAnonymousCredential(apiKey) || !apiKey.trim()) {
      return false;
    }
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: this.customHeaders(apiKey),
      }, 10000);
      return res.ok;
    } catch {
      return true; // Allow on temporary network glitch if token format is valid
    }
  }

  /**
   * Upstream Cline API only supports streamText. For non-streaming callers,
   * force upstream streaming and aggregate chunks back into ChatCompletionResponse.
   */
  override async chatCompletion(
    apiKey: string,
    messages: ChatMessage[],
    modelId: string,
    options?: CompletionOptions,
    quotaContext?: QuotaObservationContext
  ): Promise<ChatCompletionResponse> {
    // Resolve model alias if needed (e.g. unadorned free model target)
    let effectiveModel = modelId;
    if (isAnonymousCredential(apiKey) && effectiveModel === 'deepseek/deepseek-v4.1-flash-1017') {
      effectiveModel = 'cline-free/deepseek-v4.1-flash';
    }

    let content = '';
    let id = `chatcmpl-cline-${Date.now()}`;
    let created = Math.floor(Date.now() / 1000);
    let finishReason = 'stop';
    const toolCalls: ChatToolCall[] = [];

    for await (const chunk of this.streamChatCompletion(apiKey, messages, effectiveModel, options, quotaContext)) {
      if (chunk.id) id = chunk.id;
      if (chunk.created) created = chunk.created;
      const choice = chunk.choices?.[0];
      if (choice) {
        if (choice.delta?.content) {
          content += choice.delta.content;
        }
        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }
        if (choice.delta?.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            const idx = (tc as any).index ?? 0;
            if (!toolCalls[idx]) {
              toolCalls[idx] = { ...tc, function: { ...tc.function } };
            } else {
              if (tc.function?.arguments) {
                toolCalls[idx].function.arguments = (toolCalls[idx].function.arguments || '') + tc.function.arguments;
              }
            }
          }
        }
      }
    }

    const out: ChatCompletionResponse = {
      id,
      object: 'chat.completion',
      created,
      model: effectiveModel,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: content || (null as unknown as string),
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: finishReason,
      }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
    out._routed_via = { platform: 'cline', model: effectiveModel };
    return out;
  }
}
