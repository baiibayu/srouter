import crypto from 'crypto';
import { recordRouteTrace } from './route-live.js';
import {
  runWebFetch,
  DEFAULT_MAX_BYTES,
  HARD_MAX_BYTES,
  type WebFetchOutcome,
  type WebFetchResult,
  type WebFetchError,
} from '../services/web-fetch.js';

export { DEFAULT_MAX_BYTES, HARD_MAX_BYTES, type WebFetchOutcome, type WebFetchResult, type WebFetchError };

export const WEB_FETCH_TOOL_NAME = 'web_fetch';
export const WEB_FETCH_ALT_NAME = 'fetch_url';

export const WEB_FETCH_FUNCTION_DESCRIPTION =
  'Fetch readable text content from a public web URL. Use it when you need the complete documentation, '
  + 'article, or web page content to answer questions accurately.';

export const WEB_FETCH_FUNCTION_PARAMETERS = {
  type: 'object',
  properties: {
    url: { type: 'string', description: 'The public http(s) URL to fetch.' },
    max_bytes: { type: 'integer', description: 'Optional maximum bytes to fetch (default: 524288).', minimum: 1024, maximum: 2097152 },
  },
  required: ['url'],
  additionalProperties: false,
} as const;

/** Recognizes `web_fetch`, `web_fetch_preview`, `fetch_url`, or dated variants. */
export function isResponsesWebFetchTool(tool: unknown): boolean {
  if (!tool || typeof tool !== 'object') return false;
  const t = tool as { type?: unknown; name?: unknown; function?: { name?: unknown } };
  if (typeof t.type === 'string') {
    if (/^web_fetch(_preview)?(_\d{4}_\d{2}_\d{2})?$/.test(t.type)) return true;
    if (t.type === 'function') {
      const fnName = typeof t.name === 'string' ? t.name : t.function?.name;
      if (fnName === WEB_FETCH_TOOL_NAME || fnName === WEB_FETCH_ALT_NAME) return true;
    }
  }
  return false;
}

/** Run one web fetch on behalf of an agent. Never throws. */
export async function performWebFetch(rawUrl: unknown, maxBytes?: number, clientAgent?: string): Promise<WebFetchOutcome> {
  const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!url) {
    return { ok: false, url: '', error: 'missing URL', errorCode: 'invalid_url', status: 400 };
  }
  const reqId = `ftch_${crypto.randomBytes(6).toString('hex')}`;
  const startTime = Date.now();
  recordRouteTrace({
    event: 'start',
    requestId: reqId,
    attempt: 1,
    platform: 'fetch',
    model: 'web_fetch',
    requestedModel: 'web_fetch',
    clientAgent,
  });
  const outcome = await runWebFetch(url, { maxBytes });
  const latencyMs = Date.now() - startTime;
  if (outcome.ok) {
    recordRouteTrace({
      event: 'ok',
      requestId: reqId,
      attempt: 1,
      platform: outcome.via || 'fetch',
      model: 'web_fetch',
      requestedModel: 'web_fetch',
      clientAgent,
      latencyMs,
    });
  } else {
    recordRouteTrace({
      event: 'fail',
      requestId: reqId,
      attempt: 1,
      platform: 'fetch',
      model: 'web_fetch',
      requestedModel: 'web_fetch',
      clientAgent,
      latencyMs,
    });
  }
  return outcome;
}

/** Format the fetch outcome for the model context in the conversation loop. */
export function formatFetchOutcomeForModel(outcome: WebFetchOutcome): string {
  if (!outcome.ok) {
    return `Web fetch failed (${outcome.errorCode}): ${outcome.error}. Answer from what you already know, and note that the URL could not be retrieved.`;
  }
  const header = outcome.title ? `Content of ${outcome.url} (${outcome.title}):` : `Content of ${outcome.url}:`;
  const truncNote = outcome.truncated ? '\n\n[Content truncated due to size cap]' : '';
  return `${header}\n\n${outcome.text}${truncNote}`;
}

/** A replayed web_fetch_call item → a note the routed model can read. */
export function webFetchCallToText(item: Record<string, any>): string {
  const action = item?.action;
  const url = typeof action?.url === 'string' ? action.url : '';
  if (!url) return '';
  const title = typeof action?.title === 'string' && action.title ? ` (${action.title})` : '';
  return `[Fetched page content from: ${url}${title}]`;
}

export function newWebFetchCallId(): string {
  return `wf_${crypto.randomBytes(16).toString('hex')}`;
}
