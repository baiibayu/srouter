import { OpenAICompatProvider } from './openai-compat.js';
import { isAnonymousCredential } from '../lib/credential.js';
import type { ChatMessage, ChatCompletionResponse } from '@baiibayu/srouter-shared/types.js';
import type { CompletionOptions, KeyValidationResult } from './base.js';
import type { QuotaObservationContext } from '../services/provider-quota.js';
import { randomUUID } from 'crypto';

/**
 * Kiro AI (kiro.dev / AWS) - Developer assistant powered by AWS Bedrock / CodeWhisperer.
 *
 * Supports dual-mode:
 * 1. Keyless mode: Allows keyless exploration / free tier fallback.
 * 2. Authenticated mode: AWS Builder ID OIDC token from /api/oauth/kiro/authorize or custom endpoint.
 *
 * Dual-endpoint handling:
 * - If targeting direct AWS CodeWhisperer (amazonaws.com), formats as assistant conversation request.
 * - If targeting custom OpenAI-compatible endpoint/proxy, executes as standard OpenAI chat completion.
 */
export class KiroProvider extends OpenAICompatProvider {
  constructor() {
    super({
      platform: 'kiro',
      name: 'Kiro',
      baseUrl: 'https://codewhisperer.us-east-1.amazonaws.com',
      keyless: false, // Requires AWS Builder ID OAuth or custom proxy endpoint key
    });
  }

  override async fetchModelCatalog(_apiKey: string): Promise<Response> {
    const models = [
      { id: 'claude-sonnet-4.5', object: 'model' },
      { id: 'claude-haiku-4.5', object: 'model' },
      { id: 'claude-sonnet-5', object: 'model' },
      { id: 'gpt-5.6-sol', object: 'model' },
      { id: 'gpt-5.6-terra', object: 'model' },
      { id: 'gpt-5.6-luna', object: 'model' },
      { id: 'deepseek-3.2', object: 'model' },
      { id: 'minimax-m2.5', object: 'model' },
      { id: 'qwen3-coder-next', object: 'model' },
    ];
    return new Response(JSON.stringify({ object: 'list', data: models }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  protected customHeaders(apiKey: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'User-Agent': 'aws-toolkit-vscode/1.104.0 (Windows_NT 10.0.19045) VSCode/1.93.0',
      'x-amzn-codewhisperer-optout': 'true',
    };
    if (!isAnonymousCredential(apiKey) && apiKey.trim()) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }
    return headers;
  }

  override async validateKey(apiKey: string, _quotaContext?: QuotaObservationContext): Promise<KeyValidationResult> {
    if (isAnonymousCredential(apiKey) || !apiKey.trim()) {
      return false;
    }
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/ListAvailableProfiles`, {
        method: 'POST',
        headers: this.customHeaders(apiKey),
        body: JSON.stringify({ maxResults: 1 }),
      }, 10000);
      return res.ok || res.status === 403 || res.status === 400;
    } catch {
      return true;
    }
  }

  override async chatCompletion(
    apiKey: string,
    messages: ChatMessage[],
    modelId: string,
    options?: CompletionOptions,
    quotaContext?: QuotaObservationContext
  ): Promise<ChatCompletionResponse> {
    // Check if custom proxy or direct AWS endpoint
    const isDirectAws = this.baseUrl.includes('amazonaws.com');
    if (!isDirectAws) {
      // Standard OpenAI compatible proxy
      return super.chatCompletion(apiKey, messages, modelId, options, quotaContext);
    }

    // Direct AWS CodeWhisperer Conversation Request
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const userPrompt = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : JSON.stringify(lastUserMsg?.content || '');

    const history = messages.slice(0, -1).map(m => ({
      sender: m.role === 'assistant' ? 'ASSISTANT' : 'USER',
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content || ''),
    }));

    const awsPayload = {
      conversationState: {
        conversationId: randomUUID(),
        currentMessage: {
          userInputMessage: {
            content: userPrompt,
            modelId: modelId.replace(/^kiro\//, ''),
          },
        },
        chatTriggerType: 'MANUAL',
        history: history.slice(-10),
      },
    };

    const res = await this.fetchWithTimeout(`${this.baseUrl}/generateAssistantResponse`, {
      method: 'POST',
      headers: this.customHeaders(apiKey),
      body: JSON.stringify(awsPayload),
    }, options?.timeoutMs ?? 60_000, { signal: options?.signal, timeoutBounds: 'request' });

    if (!res.ok) {
      // If direct AWS call encounters 404/400 (e.g. keyless trial fallback), gracefully try standard completions
      if (res.status === 404 || res.status === 400) {
        try {
          return await super.chatCompletion(apiKey, messages, modelId, options, quotaContext);
        } catch {}
      }
      const errText = await res.text().catch(() => '');
      throw new Error(`Kiro AWS error ${res.status}: ${errText}`);
    }

    const rawText = await res.text();
    let text = rawText;
    // Extract text from event stream frames or JSON
    const contentMatch = rawText.match(/"content"\s*:\s*"([^"]+)"/);
    if (contentMatch) {
      text = contentMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    }

    const out: ChatCompletionResponse = {
      id: `chatcmpl-kiro-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: modelId,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: text,
        },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
    out._routed_via = { platform: 'kiro', model: modelId };
    return out;
  }
}
