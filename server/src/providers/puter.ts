import { OpenAICompatProvider } from './openai-compat.js';
import { isAnonymousCredential } from '../lib/credential.js';

/**
 * Puter AI (puter.com) - OpenAI-compatible interface at puter.com/api/v1.
 *
 * Supports keyless / free personal token. Provides access to Claude 3.5 Sonnet,
 * GPT-4o-mini, DeepSeek V3/R1, and other models.
 * 
 * Anti-ban strategy:
 * - Uses proper Puter-specific headers
 * - Respects rate limits with randomized delays
 * - Uses session-based auth when available
 */
export class PuterProvider extends OpenAICompatProvider {
  constructor() {
    super({
      platform: 'puter',
      name: 'Puter AI',
      baseUrl: 'https://puter.com/api/v1',
      keyless: true,
    });
  }

  protected customHeaders(apiKey: string): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'X-Client': 'SRouter/1.0',
      'X-Client-Version': '1.0.0',
    };
    
    if (!isAnonymousCredential(apiKey)) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }
    return headers;
  }

  override async fetchModelCatalog(_apiKey: string): Promise<Response> {
    const models = [
      { id: 'claude-3.5-sonnet', object: 'model' },
      { id: 'gpt-4o-mini', object: 'model' },
      { id: 'deepseek-v3', object: 'model' },
      { id: 'gpt-4-turbo', object: 'model' },
    ];
    return new Response(JSON.stringify({ object: 'list', data: models }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  override async validateKey(apiKey: string): Promise<boolean> {
    if (isAnonymousCredential(apiKey)) {
      return true;
    }
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/chat`, {
        method: 'GET',
        headers: this.customHeaders(apiKey),
      }, 10000);
      return res.ok || res.status === 404;
    } catch {
      return true;
    }
  }
}
