import type { ChatCompletionChunk, ChatCompletionResponse, ChatMessage } from '@baiibayu/srouter-shared/types.js';
import { providerHttpError, type CompletionOptions, type KeyValidationResult } from './base.js';
import { OpenAICompatProvider } from './openai-compat.js';
import type { QuotaObservationContext } from '../services/provider-quota.js';
import { isAnonymousCredential } from '../lib/credential.js';

export const BLOCKRUN_BASE_URL = 'https://api.blockrun.ai/v1';
export const BLOCKRUN_KEYLESS_URL = 'https://blockrun.ai/api/v1';

function checkModel(requested: string, returned: unknown): void {
  // Free capacity can silently substitute a different model with HTTP 200.
  // Reject before returning/yielding so the router can try another route.
  if (returned !== requested) {
    throw Object.assign(new Error('BlockRun returned a different or missing model identity'), { status: 502 });
  }
}

/** API-key gateway, with keyless fallback on blockrun.ai/api/v1. */
export class BlockRunProvider extends OpenAICompatProvider {
  constructor() {
    super({
      platform: 'blockrun',
      name: 'BlockRun',
      baseUrl: BLOCKRUN_BASE_URL,
      validateUrl: `${BLOCKRUN_BASE_URL}/account`,
      keyless: true,
    });
  }

  protected override async validationResult(response: Response): Promise<KeyValidationResult> {
    if (!response.ok && ![401, 403].includes(response.status)) {
      throw providerHttpError(response, 'BlockRun key validation is temporarily inconclusive');
    }
    return super.validationResult(response);
  }

  override async chatCompletion(apiKey: string, messages: ChatMessage[], modelId: string,
    options?: CompletionOptions, quotaContext?: QuotaObservationContext): Promise<ChatCompletionResponse> {
    const isAnon = !apiKey || isAnonymousCredential(apiKey);
    const origBase = this.baseUrl;
    if (isAnon) this.baseUrl = BLOCKRUN_KEYLESS_URL;
    try {
      const response = await super.chatCompletion(apiKey, messages, modelId, options, quotaContext);
      checkModel(modelId, response.model);
      return response;
    } finally {
      this.baseUrl = origBase;
    }
  }

  override async *streamChatCompletion(apiKey: string, messages: ChatMessage[], modelId: string,
    options?: CompletionOptions, quotaContext?: QuotaObservationContext): AsyncGenerator<ChatCompletionChunk> {
    const isAnon = !apiKey || isAnonymousCredential(apiKey);
    const origBase = this.baseUrl;
    if (isAnon) this.baseUrl = BLOCKRUN_KEYLESS_URL;
    try {
      for await (const chunk of super.streamChatCompletion(apiKey, messages, modelId, options, quotaContext)) {
        checkModel(modelId, chunk.model);
        yield chunk;
      }
    } finally {
      this.baseUrl = origBase;
    }
  }
}
