import type { Platform } from '@baiibayu/srouter-shared/types.js';
import type { KeyValidationResult } from './base.js';
import { SearchOnlyProvider } from './search-only.js';

export const JINA_SEARCH_BASE_URL = 'https://s.jina.ai/';

// Jina Search (s.jina.ai): 1M free tokens upon signup, no card. Validation probes
// s.jina.ai with a minimal POST query; an invalid or missing key responds with 401,
// while a valid key returns 200 with structured search results.
export class JinaProvider extends SearchOnlyProvider {
  readonly platform: Platform = 'jina';
  readonly name = 'Jina';

  async validateKey(apiKey: string): Promise<KeyValidationResult> {
    return this.probe(JINA_SEARCH_BASE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ q: 'srouter health probe' }),
    });
  }
}
