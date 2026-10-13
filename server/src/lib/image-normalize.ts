import type { ChatMessage } from '@srouter/shared/types.js';

// Inbound image normalization. Vision payloads ride inline as base64 data
// URLs, and agents replay their ENTIRE history every turn — one real Codex
// session accumulated 11.85MB of duplicated screenshots. Every upstream
// resizes internally anyway (OpenAI scales the long edge to 2048, Anthropic
// to 1568), so pixels beyond that cap are pure transport waste that still
// counts against payload limits (Gemini ~20MB/request, Anthropic 5MB/image)
// and our own buffering.
//
// Runs after body parsing on every chat-shaped surface (proxy, responses,
// anthropic, and the inbound-chat funnel behind Ollama/Gemini wire): data-URL
// images over the size threshold are decoded, downscaled to fit
// IMAGE_NORMALIZE_MAX_DIMENSION, and re-encoded — JPEG q<quality>, or PNG
// only when the alpha channel ACTUALLY carries transparency. Screenshots are
// the gotcha: macOS ships them as RGBA PNGs that are fully opaque, and
// honoring the bare hasAlpha flag kept them on PNG, "compressing" 2.0MB →
// 1.9MB. http(s) URLs are left alone — providers that need the bytes fetch
// them themselves (see google.ts). Failures anywhere in the pipeline keep the
// original image: a vision request must never be lost to a transcoding
// hiccup.
//
// Knobs (env):
//   IMAGE_NORMALIZE                 off/false/0 disables entirely (default on)
//   IMAGE_NORMALIZE_MAX_DIMENSION   long-edge cap in px (default 2048)
//   IMAGE_NORMALIZE_THRESHOLD_KB    raw-bytes floor before touching an image
//                                   (default 1024 — small images decode-free)
//   IMAGE_NORMALIZE_QUALITY         JPEG quality, 1-100 (default 90)
//
// Input formats: anything libvips decodes — jpeg, png, webp, gif (first
// frame only — animation is dropped), tiff (first page), bmp, svg (rasterized
// at native size), avif. Formats it can't decode (notably HEIC on standard
// builds) and any corrupt payload fall through untouched: the provider sees
// the original and decides.

const DEFAULT_MAX_DIMENSION = 2048;
const DEFAULT_THRESHOLD_KB = 1024;
const DEFAULT_QUALITY = 90;

// sharp is a NATIVE module: it ships a prebuilt libvips per platform+arch, and
// a static `import sharp from 'sharp'` makes a missing or mismatched binary an
// import-time crash — the whole gateway would fail to boot over an optional
// image optimization. The desktop build only runs electron-rebuild for
// better-sqlite3, and slim/musl containers routinely lack the matching
// prebuild, so load it on first use instead and degrade to pass-through when
// it isn't there: images ride through at original size, exactly as they did
// before this module existed.
type Sharp = typeof import('sharp').default;
let sharpModule: Sharp | null | undefined;   // undefined = not yet attempted

async function loadSharp(): Promise<Sharp | null> {
  if (sharpModule !== undefined) return sharpModule;
  try {
    sharpModule = (await import('sharp')).default;
  } catch (err: any) {
    sharpModule = null;
    console.warn(
      '[ImageNormalize] sharp is unavailable, inbound images will not be resized ' +
      `(set IMAGE_NORMALIZE=off to silence this): ${err?.message ?? err}`,
    );
  }
  return sharpModule;
}

export interface ImageNormalizeOptions {
  enabled?: boolean;
  maxDimension?: number;
  thresholdBytes?: number;
  quality?: number;
}

interface ResolvedOptions {
  enabled: boolean;
  maxDimension: number;
  thresholdBytes: number;
  quality: number;
}

function envFlagOff(raw: string | undefined): boolean {
  if (!raw) return false;
  const lower = raw.trim().toLowerCase();
  return lower === 'off' || lower === 'false' || lower === '0' || lower === 'no';
}

function envNumber(raw: string | undefined, fallback: number, min: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min) return fallback;
  return Math.floor(n);
}

// Read lazily (not at import) so tests can steer the knobs via process.env
// without module-reload gymnastics.
function resolveOptions(overrides?: ImageNormalizeOptions): ResolvedOptions {
  return {
    enabled: overrides?.enabled ?? !envFlagOff(process.env.IMAGE_NORMALIZE),
    maxDimension: overrides?.maxDimension
      ?? envNumber(process.env.IMAGE_NORMALIZE_MAX_DIMENSION, DEFAULT_MAX_DIMENSION, 16),
    thresholdBytes: overrides?.thresholdBytes
      ?? envNumber(process.env.IMAGE_NORMALIZE_THRESHOLD_KB, DEFAULT_THRESHOLD_KB, 0) * 1024,
    quality: Math.min(100, overrides?.quality
      ?? envNumber(process.env.IMAGE_NORMALIZE_QUALITY, DEFAULT_QUALITY, 1)),
  };
}

const DATA_URL_RE = /^data:([^;,]+)?(;base64)?,(.*)$/s;

interface ImageSlot {
  /** Rewrite the block in place with the new data URL. */
  set(url: string): void;
  url: string;
}

// Collect the mutable image slots of one message: OpenAI-style `image_url`
// blocks in both the shorthand (string) and object ({ url }) forms.
function imageSlots(message: ChatMessage): ImageSlot[] {
  if (!Array.isArray(message.content)) return [];
  const slots: ImageSlot[] = [];
  for (const block of message.content) {
    if (!block || typeof block !== 'object') continue;
    const b = block as { type?: string; image_url?: unknown };
    if (b.type !== 'image_url' && b.type !== 'image') continue;
    if (typeof b.image_url === 'string') {
      slots.push({ url: b.image_url, set: (url) => { (block as { image_url?: unknown }).image_url = url; } });
    } else if (b.image_url && typeof (b.image_url as { url?: unknown }).url === 'string') {
      const obj = b.image_url as { url: string };
      slots.push({ url: obj.url, set: (url) => { obj.url = url; } });
    }
  }
  return slots;
}

// Transcode one data URL; returns null when the image should ride along
// unchanged (under threshold, already compact, http URL, or any failure).
async function normalizeDataUrl(sharp: Sharp, url: string, opts: ResolvedOptions): Promise<{ url: string; before: number; after: number } | null> {
  const match = DATA_URL_RE.exec(url);
  if (!match) return null;
  const mime = (match[1] ?? '').toLowerCase();
  const isBase64 = Boolean(match[2]);
  const payload = match[3] ?? '';
  if (!isBase64 || !mime.startsWith('image/') || payload.length === 0) return null;

  const rawBytes = Math.floor(payload.length * 3 / 4);
  const alreadyCompact = mime === 'image/jpeg' || mime === 'image/webp';

  // Cheap pre-filter: under the threshold AND already a lossy format means
  // there is nothing to win — skip the decode entirely. Oversized-dimension
  // images under the threshold are rare enough (pixels ≈ bytes) that this
  // trade stays worth it.
  if (rawBytes < opts.thresholdBytes && alreadyCompact) return null;

  let buffer: Buffer;
  try {
    buffer = Buffer.from(payload, 'base64');
  } catch {
    return null;
  }

  try {
    const image = sharp(buffer);
    const meta = await image.metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const needsResize = width > opts.maxDimension || height > opts.maxDimension;
    // Small, right-sized, already-compact: nothing to win — skip the decode.
    if (!needsResize && alreadyCompact && rawBytes < opts.thresholdBytes) return null;
    // An over-threshold JPEG/WebP at the right size still gets re-encoded at
    // the target quality below (the never-grow guard keeps the original when
    // that can't win), so there is no early return for it.

    let pipeline = image;
    if (needsResize) {
      pipeline = pipeline.resize({
        width: opts.maxDimension,
        height: opts.maxDimension,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
    // Alpha is only worth keeping when it actually carries transparency.
    // Screenshots (the dominant vision payload here) are RGBA-but-fully-
    // opaque; honoring the bare hasAlpha flag kept them on PNG and squeezed
    // 2.0MB → 1.9MB instead of → ~300KB. stats() decodes, but we were about
    // to re-encode anyway.
    let keepAlpha = false;
    if (meta.hasAlpha) {
      try {
        keepAlpha = (await sharp(buffer).stats()).isOpaque === false;
      } catch {
        keepAlpha = true; // unknown opacity: stay lossless
      }
    }
    const out = keepAlpha
      ? { buffer: await pipeline.png().toBuffer(), mime: 'image/png' }
      : {
        buffer: await pipeline
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .jpeg({ quality: opts.quality })
          .toBuffer(),
        mime: 'image/jpeg',
      };

    // Never make it bigger (tiny paletted PNGs can lose to JPEG overhead).
    if (out.buffer.length >= buffer.length) return null;
    return {
      url: `data:${out.mime};base64,${out.buffer.toString('base64')}`,
      before: buffer.length,
      after: out.buffer.length,
    };
  } catch {
    // Corrupt/unsupported image: the provider gets the original and decides.
    return null;
  }
}

export interface ImageNormalizeSummary {
  messages: ChatMessage[];
  /** Number of images actually re-encoded. */
  normalized: number;
  bytesBefore: number;
  bytesAfter: number;
}

/**
 * Downscale + re-encode over-threshold inline images across a chat-message
 * list. Pure with respect to everything but the image blocks themselves
 * (text, tool calls, detail hints, block order all untouched). Never throws.
 */
export async function normalizeMessageImages(
  messages: ChatMessage[],
  overrides?: ImageNormalizeOptions,
): Promise<ImageNormalizeSummary> {
  const opts = resolveOptions(overrides);
  const summary: ImageNormalizeSummary = { messages, normalized: 0, bytesBefore: 0, bytesAfter: 0 };
  if (!opts.enabled) return summary;

  // No sharp (missing prebuild, unsupported platform): pass everything through
  // untouched rather than failing the request.
  const sharp = await loadSharp();
  if (!sharp) return summary;

  for (const message of messages) {
    for (const slot of imageSlots(message)) {
      if (!slot.url.startsWith('data:')) continue;
      const result = await normalizeDataUrl(sharp, slot.url, opts);
      if (!result) continue;
      slot.set(result.url);
      summary.normalized += 1;
      summary.bytesBefore += result.before;
      summary.bytesAfter += result.after;
    }
  }

  if (summary.normalized > 0) {
    const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
    console.log(`[ImageNormalize] re-encoded ${summary.normalized} image(s): ${mb(summary.bytesBefore)}MB → ${mb(summary.bytesAfter)}MB`);
  }
  return summary;
}
