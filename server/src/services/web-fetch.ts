import net from 'node:net';
import dns from 'node:dns/promises';
import { stripTags } from '../lib/html.js';
import { getTinyfishApiKey } from './web-search.js';
import { recordFetchUsage } from './fetch-usage.js';
import { fetchChainOrder, type FetchSourceId } from './fetch-sources.js';

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
export const FETCH_TIMEOUT_MS = 15_000;
export const JINA_TIMEOUT_MS = 20_000;
export const TINYFISH_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_BYTES = 512 * 1024;
export const HARD_MAX_BYTES = 2 * 1024 * 1024;

// ── SSRF guard ─────────────────────────────────────────────────────────────

export function isPrivateAddress(addr: string): boolean {
  if (net.isIPv4(addr)) {
    const [a, b] = addr.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true;            // this-host / RFC1918 / loopback
    if (a === 169 && b === 254) return true;                       // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;              // RFC1918
    if (a === 192 && b === 168) return true;                       // RFC1918
    if (a === 100 && b >= 64 && b <= 127) return true;             // CGNAT
    if (a >= 224) return true;                                     // multicast + reserved + broadcast
    return false;
  }
  if (net.isIPv6(addr)) {
    const lower = addr.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;               // ULA fc00::/7
    if (/^fe[89ab]/.test(lower)) return true;                                       // link-local fe80::/10
    if (lower.startsWith('ff')) return true;                                        // multicast
    const mapped = lower.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return true; // unparseable → assume private
}

export const PRIVATE_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.home.lan'];
export const PRIVATE_HOSTS = new Set(['localhost', 'metadata.google.internal', 'metadata', 'broadcasthost']);

export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('only http/https URLs are supported');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (PRIVATE_HOSTS.has(host) || PRIVATE_HOST_SUFFIXES.some(s => host.endsWith(s))) {
    throw new Error('URL targets a private/internal host');
  }
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('URL targets a private/internal address');
    return url;
  }
  // Resolve first: a public-looking name pointing at 127.0.0.1 is exactly the
  // attack this guard exists for.
  let addrs: { address: string }[];
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    throw new Error('hostname did not resolve');
  }
  if (addrs.some(a => isPrivateAddress(a.address))) {
    throw new Error('URL resolves to a private/internal address');
  }
  return url;
}

// ── Bounded body reading + HTML→text ───────────────────────────────────────

export async function readBounded(res: { body?: ReadableStream<Uint8Array> | null; arrayBuffer(): Promise<ArrayBuffer> }, maxBytes: number): Promise<{ buf: Buffer; truncated: boolean }> {
  const reader = res.body?.getReader?.();
  if (!reader) {
    const ab = await res.arrayBuffer();
    if (ab.byteLength <= maxBytes) return { buf: Buffer.from(ab), truncated: false };
    return { buf: Buffer.from(ab.slice(0, maxBytes)), truncated: true };
  }
  const chunks: Buffer[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    if (total + chunk.length >= maxBytes) {
      chunks.push(chunk.subarray(0, maxBytes - total));
      truncated = true;
      try { await reader.cancel(); } catch { /* already closed */ }
      break;
    }
    chunks.push(chunk);
    total += chunk.length;
  }
  return { buf: Buffer.concat(chunks), truncated };
}

/** Bounded HTML → plain text: title + visible body text, sane whitespace. */
export function htmlToText(html: string): { title: string | null; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]).trim() || null : null;
  let body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|canvas|template)[\s\S]*?<\/\1>/gi, ' ');
  body = body
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|header|footer|main|aside|tr|blockquote|h[1-6])>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n');
  const text = stripTags(body)
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title, text };
}

export function bounded(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const buf = Buffer.from(text, 'utf8');
  if (buf.length <= maxBytes) return { text, truncated: false };
  return { text: buf.subarray(0, maxBytes).toString('utf8'), truncated: true };
}

export function readerChainOrder(): Array<'tinyfish' | 'jina'> {
  return fetchChainOrder(process.env.FETCH_PRIMARY ?? 'auto');
}

// ── Web Fetch Outcome Types ────────────────────────────────────────────────

export interface WebFetchResult {
  ok: true;
  url: string;
  via: 'direct' | 'tinyfish' | 'jina';
  title: string | null;
  text: string;
  truncated: boolean;
  contentType?: string;
}

export interface WebFetchError {
  ok: false;
  url: string;
  error: string;
  errorCode: 'invalid_url' | 'blocked_private' | 'fetch_failed' | 'timeout';
  status: number;
}

export type WebFetchOutcome = WebFetchResult | WebFetchError;

/**
 * Executes a public URL fetch with SSRF verification, usage recording,
 * direct fetch, and reader fallback (TinyFish -> Jina).
 */
export async function runWebFetch(
  rawUrl: string,
  options: { maxBytes?: number; signal?: AbortSignal } = {},
): Promise<WebFetchOutcome> {
  const maxBytes = Math.min(Math.max(options.maxBytes ?? DEFAULT_MAX_BYTES, 1024), HARD_MAX_BYTES);

  let url: URL;
  try {
    url = await assertPublicHttpUrl(rawUrl);
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    const isPrivate = msg.includes('private') || msg.includes('internal') || msg.includes('resolve');
    return {
      ok: false,
      url: rawUrl,
      error: `Fetch blocked: ${msg}`,
      errorCode: isPrivate ? 'blocked_private' : 'invalid_url',
      status: 400,
    };
  }

  // Counted here, past the SSRF guard:
  recordFetchUsage();

  // 1) Direct fetch — readable text, entity-decoded.
  try {
    const directSignal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)])
      : AbortSignal.timeout(FETCH_TIMEOUT_MS);

    const direct = await fetch(url.toString(), {
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,text/plain,*/*' },
      signal: directSignal,
      redirect: 'follow',
    });

    if (direct.ok) {
      const { buf, truncated } = await readBounded(direct, maxBytes);
      const contentType = direct.headers.get('content-type') ?? '';
      if (/text\/html|application\/xhtml/i.test(contentType)) {
        const { title, text } = htmlToText(buf.toString('utf8'));
        const cut = bounded(text, maxBytes);
        return {
          ok: true,
          url: url.toString(),
          via: 'direct',
          title,
          text: cut.text,
          truncated: truncated || cut.truncated,
          contentType: contentType || undefined,
        };
      }
      const asText = buf.toString('utf8');
      const cut = bounded(asText, maxBytes);
      return {
        ok: true,
        url: url.toString(),
        via: 'direct',
        title: null,
        text: cut.text,
        truncated: truncated || cut.truncated,
        contentType: contentType || undefined,
      };
    }
  } catch {
    // fall through to the reader fallbacks
  }

  // 2) Reader fallbacks, in fetch-config order (effective primary first,
  //    then the other reader). TinyFish needs its key; Jina is keyless.
  const chain = readerChainOrder();
  for (const reader of chain) {
    try {
      if (reader === 'tinyfish') {
        const tinyfishKey = getTinyfishApiKey();
        if (!tinyfishKey) continue;
        const tfSignal = options.signal
          ? AbortSignal.any([options.signal, AbortSignal.timeout(TINYFISH_TIMEOUT_MS)])
          : AbortSignal.timeout(TINYFISH_TIMEOUT_MS);
        const resp = await fetch('https://api.fetch.tinyfish.ai', {
          method: 'POST',
          headers: {
            'x-api-key': tinyfishKey,
            'content-type': 'application/json',
            accept: 'application/json',
            'user-agent': UA,
          },
          body: JSON.stringify({ urls: [url.toString()], format: 'markdown' }),
          signal: tfSignal,
        });
        if (resp.ok) {
          const data = await resp.json() as { results?: Array<{ title?: string | null; text?: string | null }> };
          const got = data.results?.[0];
          if (got?.text) {
            const cut = bounded(got.text, maxBytes);
            return {
              ok: true,
              url: url.toString(),
              via: 'tinyfish',
              title: got.title ?? null,
              text: cut.text,
              truncated: cut.truncated,
              contentType: 'text/markdown',
            };
          }
        }
      } else {
        const jinaSignal = options.signal
          ? AbortSignal.any([options.signal, AbortSignal.timeout(JINA_TIMEOUT_MS)])
          : AbortSignal.timeout(JINA_TIMEOUT_MS);
        const resp = await fetch(`https://r.jina.ai/${url.toString()}`, {
          headers: { 'user-agent': 'srouter/1.0', accept: 'text/plain' },
          signal: jinaSignal,
        });
        if (resp.ok) {
          const { buf, truncated } = await readBounded(resp, maxBytes);
          const cut = bounded(buf.toString('utf8'), maxBytes);
          return {
            ok: true,
            url: url.toString(),
            via: 'jina',
            title: null,
            text: cut.text,
            truncated: truncated || cut.truncated,
            contentType: 'text/markdown',
          };
        }
      }
    } catch {
      // Reader unreachable → try next reader
    }
  }

  return {
    ok: false,
    url: url.toString(),
    error: 'Fetch failed: direct and reader fallback both rejected the request',
    errorCode: 'fetch_failed',
    status: 502,
  };
}
