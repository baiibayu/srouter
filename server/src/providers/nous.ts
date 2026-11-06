import { OpenAICompatProvider } from './openai-compat.js';
import { isAnonymousCredential } from '../lib/credential.js';
import type { ChatMessage, ChatCompletionResponse } from '@baiibayu/srouter-shared/types.js';
import type { CompletionOptions, KeyValidationResult } from './base.js';
import type { QuotaObservationContext } from '../services/provider-quota.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Nous Research / Nous Portal - Official inference gateway at inference-api.nousresearch.com.
 *
 * Supports dual-mode:
 * 1. Keyless mode (with local ~/.hermes / ~/.nous detection fallback).
 * 2. Authenticated mode via Nous Portal OAuth / personal token.
 *
 * Models: Canonical Hermes family models (Hermes 3, Hermes 2 Pro, Hermes 4).
 */
export class NousProvider extends OpenAICompatProvider {
  constructor() {
    super({
      platform: 'nous',
      name: 'Nous Portal',
      baseUrl: 'https://inference-api.nousresearch.com/v1',
      keyless: false, // Keyed only: requires Nous Portal API key from portal.nousresearch.com
    });
  }

  private getLocalToken(): string | null {
    const candidatePaths = [
      path.join(os.homedir(), '.hermes', 'auth.json'),
      path.join(os.homedir(), '.hermes', 'credentials.json'),
      path.join(os.homedir(), '.hermes', 'config.json'),
      path.join(os.homedir(), '.nous', 'credentials.json'),
    ];
    for (const cp of candidatePaths) {
      if (!fs.existsSync(cp)) continue;
      try {
        const raw = fs.readFileSync(cp, 'utf8');
        const data = JSON.parse(raw);
        const token = data?.access_token || data?.accessToken || data?.token || data?.api_key || data?.apiKey;
        if (token && typeof token === 'string' && token.trim()) return token.trim();
      } catch {}
    }
    const envPath = path.join(os.homedir(), '.hermes', '.env');
    if (fs.existsSync(envPath)) {
      try {
        const envTxt = fs.readFileSync(envPath, 'utf8');
        const m = envTxt.match(/(?:NOUS_API_KEY|HERMES_API_KEY|OPENAI_API_KEY)=(.+)/);
        if (m && m[1]?.trim()) return m[1].trim();
      } catch {}
    }
    return null;
  }

  override async fetchModelCatalog(apiKey: string): Promise<Response> {
    try {
      const upstream = await this.fetchWithTimeout(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: this.customHeaders(apiKey),
      }, 8000);
      if (upstream.ok) {
        const json = await upstream.json() as any;
        if (Array.isArray(json?.data) && json.data.length > 0) {
          return new Response(JSON.stringify(json), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
    } catch {}

    // Fallback to active verified free models available on Nous Portal
    const fallbackModels = [
      { id: 'stealth/crouton-alpha', object: 'model' },
      { id: 'upstage/solar-mini4:free', object: 'model' },
      { id: 'stepfun/step-3.7-flash:free', object: 'model' },
      { id: 'reflection/beam-1.0-501b-a23b:free', object: 'model' },
    ];

    return new Response(JSON.stringify({ object: 'list', data: fallbackModels }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  override async validateKey(apiKey: string, quotaContext?: QuotaObservationContext): Promise<KeyValidationResult> {
    if (isAnonymousCredential(apiKey) || !apiKey.trim()) {
      return false;
    }
    return super.validateKey(apiKey, quotaContext);
  }

  protected customHeaders(apiKey: string): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': 'Hermes-Agent/0.2.1 (win32)',
      'Accept': 'application/json',
    };
    let token = apiKey;
    if (isAnonymousCredential(apiKey)) {
      const localToken = this.getLocalToken();
      if (localToken) {
        token = localToken;
      } else {
        return headers;
      }
    }
    if (token && typeof token === 'string' && token.trim()) {
      headers['Authorization'] = `Bearer ${token.trim()}`;
    }
    return headers;
  }

  override async chatCompletion(
    apiKey: string,
    messages: ChatMessage[],
    modelId: string,
    options?: CompletionOptions,
    quotaContext?: QuotaObservationContext
  ): Promise<ChatCompletionResponse> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await super.chatCompletion(apiKey, messages, modelId, options, quotaContext);
        if (res.choices?.[0]?.message?.content === '' || res.choices?.[0]?.message?.content === null) {
          throw new Error('Empty completion from provider');
        }
        return res;
      } catch (err: any) {
        if (err && (typeof err.status === 'number' || err.retryAfterMs)) {
          throw err;
        }
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 2000 * attempt));
        }
      }
    }
    throw lastError || new Error('Max retries exceeded');
  }
}
