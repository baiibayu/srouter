// /v1 utility endpoints: web-search + URL fetch.
//
// Why this exists: many providers/aggregators expose no web_search or URL
// fetch tools for their models, so an agent task dies on "search this" or
// "read that". SRouter answers those itself — same API key as the inference
// endpoints, rate-limited by the shared /v1 proxy limiter (mounted in app.ts).
//
//   POST /v1/web-search  {query, max_results?}   → multi-backend search (see
//       services/web-search.ts: keyless-first — DuckDuckGo default, SearXNG /
//       Tavily / Brave / Exa / TinyFish via Settings, auto-fallback to
//       DuckDuckGo)
//   POST /v1/fetch       {url, max_bytes?}       → readable text, SSRF-guarded
//
// Fetch is an SSRF surface by definition (the caller hands us a URL to
// request), so it only ever leaves toward PUBLIC http(s) addresses: literal
// private ranges, localhost-ish names, and hostnames whose DNS resolution
// lands private are rejected before any socket is opened. The response body
// is read with a hard byte cap.

import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import net from 'node:net';
import dns from 'node:dns/promises';
import { requireInferenceAuth } from './proxy.js';
import { stripTags } from '../lib/html.js';
import { searchWeb, getTinyfishApiKey } from '../services/web-search.js';

export const toolsRouter = Router();

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 15_000;
const JINA_TIMEOUT_MS = 20_000;
const TINYFISH_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 512 * 1024;
const HARD_MAX_BYTES = 2 * 1024 * 1024;

// ── SSRF guard ─────────────────────────────────────────────────────────────

function isPrivateAddress(addr: string): boolean {
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

const PRIVATE_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.home.lan'];
const PRIVATE_HOSTS = new Set(['localhost', 'metadata.google.internal', 'metadata', 'broadcasthost']);

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
  // attack this guard exists for. (Documented residual: DNS re-binding between
  // this check and the actual connect — accepted for a self-hosted gateway.)
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

async function readBounded(res: { body?: ReadableStream<Uint8Array> | null; arrayBuffer(): Promise<ArrayBuffer> }, maxBytes: number): Promise<{ buf: Buffer; truncated: boolean }> {
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

function bounded(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const buf = Buffer.from(text, 'utf8');
  if (buf.length <= maxBytes) return { text, truncated: false };
  return { text: buf.subarray(0, maxBytes).toString('utf8'), truncated: true };
}

// ── POST /v1/web-search ────────────────────────────────────────────────────
// Backends, config and parsing live in services/web-search.ts (keyless-first,
// fallback chain: pick → DuckDuckGo → SearXNG → keyed largest-quota-first);
// this router only validates and shapes. A response that needed more than one
// attempt carries `attempts` (who failed, why, who answered).

const webSearchSchema = z.object({
  query: z.string().trim().min(1).max(500),
  max_results: z.number().int().min(1).max(10).optional(),
});

toolsRouter.post('/web-search', async (req: Request, res: Response) => {
  if (!requireInferenceAuth(req, res)) return;
  const parsed = webSearchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: 'Invalid web-search request: send {query, max_results?}', type: 'invalid_request_error' } });
    return;
  }
  try {
    const { provider, results, attempts } = await searchWeb(parsed.data.query, parsed.data.max_results ?? 5);
    res.json({ provider, query: parsed.data.query, results, ...(attempts ? { attempts } : {}) });
  } catch (err: any) {
    res.status(502).json({ error: { message: `Web search failed: ${err.message}`, type: 'api_error' } });
  }
});

// ── POST /v1/fetch ─────────────────────────────────────────────────────────

const fetchSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  max_bytes: z.number().int().min(1024).max(HARD_MAX_BYTES).optional(),
});

toolsRouter.post('/fetch', async (req: Request, res: Response) => {
  if (!requireInferenceAuth(req, res)) return;
  const parsed = fetchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: 'Invalid fetch request: send {url, max_bytes?}', type: 'invalid_request_error' } });
    return;
  }
  const maxBytes = parsed.data.max_bytes ?? DEFAULT_MAX_BYTES;

  let url: URL;
  try {
    url = await assertPublicHttpUrl(parsed.data.url);
  } catch (err: any) {
    res.status(400).json({ error: { message: `Fetch blocked: ${err.message}`, type: 'invalid_request_error' } });
    return;
  }

  // 1) Direct fetch — readable text, entity-decoded.
  try {
    const direct = await fetch(url.toString(), {
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,text/plain,*/*' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    });
    if (direct.ok) {
      const { buf, truncated } = await readBounded(direct, maxBytes);
      const contentType = direct.headers.get('content-type') ?? '';
      if (/text\/html|application\/xhtml/i.test(contentType)) {
        const { title, text } = htmlToText(buf.toString('utf8'));
        const cut = bounded(text, maxBytes);
        res.json({ url: url.toString(), via: 'direct', title, text: cut.text, truncated: truncated || cut.truncated });
        return;
      }
      const asText = buf.toString('utf8');
      const cut = bounded(asText, maxBytes);
      res.json({ url: url.toString(), via: 'direct', title: null, text: cut.text, truncated: truncated || cut.truncated, content_type: contentType || undefined });
      return;
    }
    throw new Error(`direct fetch responded ${direct.status}`);
  } catch {
    // fall through to the reader fallbacks
  }

  // 2) TinyFish Fetch (free tier: 1,000 URLs/day) — only when its key is
  //    stored (the same account-wide key powers the search backend). Renders
  //    JS-heavy/anti-bot pages and returns markdown, same contract as Jina.
  try {
    const tinyfishKey = getTinyfishApiKey();
    if (tinyfishKey) {
      const reader = await fetch('https://api.fetch.tinyfish.ai', {
        method: 'POST',
        headers: {
          'x-api-key': tinyfishKey,
          'content-type': 'application/json',
          accept: 'application/json',
          'user-agent': UA,
        },
        body: JSON.stringify({ urls: [url.toString()], format: 'markdown' }),
        signal: AbortSignal.timeout(TINYFISH_TIMEOUT_MS),
      });
      if (reader.ok) {
        const data = await reader.json() as { results?: Array<{ title?: string | null; text?: string | null }> };
        const got = data.results?.[0];
        if (got?.text) {
          const cut = bounded(got.text, maxBytes);
          res.json({ url: url.toString(), via: 'tinyfish', title: got.title ?? null, text: cut.text, truncated: cut.truncated, content_type: 'text/markdown' });
          return;
        }
      }
      // Anything else (429/402/no text) → fall through to Jina.
    }
  } catch {
    // TinyFish unreachable → Jina next
  }

  // 3) Jina Reader fallback — handles bot walls/JS-heavy pages, returns
  //    markdown, free tier without a key (rate-limited per IP).
  try {
    const reader = await fetch(`https://r.jina.ai/${url.toString()}`, {
      headers: { 'user-agent': 'srouter/1.0', accept: 'text/plain' },
      signal: AbortSignal.timeout(JINA_TIMEOUT_MS),
    });
    if (reader.ok) {
      const { buf, truncated } = await readBounded(reader, maxBytes);
      const cut = bounded(buf.toString('utf8'), maxBytes);
      res.json({ url: url.toString(), via: 'jina', title: null, text: cut.text, truncated: truncated || cut.truncated, content_type: 'text/markdown' });
      return;
    }
    res.status(502).json({ error: { message: `Fetch failed: direct and reader fallback both rejected the request (reader status ${reader.status})`, type: 'api_error' } });
  } catch (err: any) {
    res.status(502).json({ error: { message: `Fetch failed: ${err.message}`, type: 'api_error' } });
  }
});
