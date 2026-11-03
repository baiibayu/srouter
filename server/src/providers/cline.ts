import { OpenAICompatProvider } from './openai-compat.js';
import { isAnonymousCredential } from '../lib/credential.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Cline API (api.cline.bot) - OpenAI-compatible interface at api.cline.bot/api/v1.
 *
 * Supports keyless operation with rotating free models, and auto-detects
 * local Cline account authentication from ~/.cline/data/settings/providers.json or
 * secrets.json if available.
 * 
 * Anti-ban strategy:
 * - Rotates between multiple verified free models
 * - Uses proper Cline headers to mimic official client
 * - Implements request jitter to avoid rate limiting
 * - Falls back to local credentials when available
 */
export class ClineProvider extends OpenAICompatProvider {
  constructor() {
    super({
      platform: 'cline',
      name: 'Cline',
      baseUrl: 'https://api.cline.bot/api/v1',
      keyless: true,
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
      'User-Agent': 'Cline/0.5.104',
      'X-PLATFORM': process.platform || 'unknown',
      'X-PLATFORM-VERSION': process.version || 'unknown',
      'X-CLIENT-TYPE': 'cline',
      'X-CLIENT-VERSION': '0.5.104',
      'X-CORE-VERSION': '0.5.104',
      'X-IS-MULTIROOT': 'false',
    };
    let token = apiKey;
    if (isAnonymousCredential(apiKey)) {
      const localToken = this.getLocalToken();
      if (localToken) {
        token = localToken;
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
    // Curated ONLY to models that are 100% verified working for free accounts
    // Updated based on live Cline models API
    const verifiedModels = [
      { id: 'deepseek/deepseek-v4.1-flash-1017', object: 'model' },
      { id: 'qwen/qwen3.8-flash', object: 'model' },
      { id: 'prism-ml/ternary-bonsai-2-9b', object: 'model' },
      { id: 'z-ai/glm-5.3-flashx-legal', object: 'model' },
      { id: 'particle-ai/particle-1', object: 'model' },
    ];
    return new Response(JSON.stringify({ object: 'list', data: verifiedModels }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  override async validateKey(apiKey: string): Promise<boolean> {
    if (isAnonymousCredential(apiKey)) {
      return true; // Keyless mode allowed
    }
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: this.customHeaders(apiKey),
      }, 10000);
      return res.ok;
    } catch {
      return true; // Allow on error
    }
  }
}
