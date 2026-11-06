import type { ChatCompletionChunk, ChatCompletionResponse } from '@baiibayu/srouter-shared/types.js';
import { BaseProvider, providerHttpError, type KeyValidationResult, type CompletionOptions } from './base.js';

export const FREEAI_BASE_URL = 'https://api.free.ai';

/** Only download the output shape exercised live, not arbitrary upstream URLs. */
export function freeAiAudioUrl(body: unknown): string | null {
  if (!body || typeof body !== 'object' || !('audio_url' in body) || typeof body.audio_url !== 'string') return null;
  try {
    const url = new URL(body.audio_url);
    if (url.origin !== FREEAI_BASE_URL || url.username || url.password || url.search || url.hash
      || !/^\/static\/outputs\/[0-9a-f-]{36}\.wav$/i.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

/** TTS-only until the mismatched chat aliases are resolved. Free accounts share
 * 30K tokens/day and 1K API requests/month (no card; verified 2026-10-11).
 * https://free.ai/api/ — model rows belong only in the signed catalog.
 *
 * Free.ai accepts any key (even empty) for free-tier TTS access; there is no
 * meaningful key validation endpoint that doesn't consume quota. Registered
 * as keyless so the gateway stores a sentinel row and routing treats it as
 * configured. The free tier is rate-limited per IP, not per key.
 */
export class FreeAiProvider extends BaseProvider {
  readonly platform = 'freeai' as const;
  readonly name = 'Free.ai';
  readonly keyless = true; // Free-tier TTS accepts any key / no key

  async validateKey(apiKey: string): Promise<KeyValidationResult> {
    // Keyless provider: any key (including empty/bearer 'public') is accepted
    return true;
  }

  async chatCompletion(): Promise<ChatCompletionResponse> {
    throw Object.assign(new Error('Free.ai currently supports /v1/audio/speech, not chat completions'), { status: 400 });
  }

  // eslint-disable-next-line require-yield
  async *streamChatCompletion(): AsyncGenerator<ChatCompletionChunk> {
    throw Object.assign(new Error('Free.ai currently supports /v1/audio/speech, not chat completions'), { status: 400 });
  }
}
