// /v1 utility endpoints: web-search + URL fetch.
//
// Why this exists: many providers/aggregators expose no web_search or URL
// fetch tools for their models, so an agent task dies on "search this" or
// "read that". SRouter answers those itself — same API key as the inference
// endpoints, rate-limited by the shared /v1 proxy limiter (mounted in app.ts).
//
//   POST /v1/fetch       {url, max_bytes?}       → readable text, SSRF-guarded
//   GET  /v1/fetch/sources                        → the reader registry, the
//                                                   same shape GET
//                                                   /v1/search/engines uses
//
// Fetch is an SSRF surface by definition (the caller hands us a URL to
// request), so it only ever leaves toward PUBLIC http(s) addresses: literal
// private ranges, localhost-ish names, and hostnames whose DNS resolution
// lands private are rejected before any socket is opened. The response body
// is read with a hard byte cap.

import crypto from 'node:crypto';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requireInferenceAuth, traceRouteEvent } from './proxy.js';
import { getClientContext } from '../lib/client-context.js';
import { listFetchSources } from '../services/fetch-sources.js';
import {
  runWebFetch,
  assertPublicHttpUrl,
  htmlToText,
  DEFAULT_MAX_BYTES,
  HARD_MAX_BYTES,
} from '../services/web-fetch.js';

export { assertPublicHttpUrl, htmlToText };

export const toolsRouter = Router();

// The reader registry, public over the inference key — the counterpart of
// GET /v1/search/engines so agents can see which reader answers and whether
// it is configured. Only enabled sources are listed, exactly like engines.
toolsRouter.get('/fetch/sources', (req: Request, res: Response) => {
  if (!requireInferenceAuth(req, res)) return;
  res.json({
    object: 'list',
    data: listFetchSources()
      .filter(source => source.enabled)
      .map(source => ({
        id: source.sourceId,
        object: 'fetch_source',
        provider: source.platform,
        name: source.displayName,
        quota_label: source.quotaLabel,
        configured: source.configured,
      })),
  });
});

const fetchSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  max_bytes: z.number().int().min(1024).max(HARD_MAX_BYTES).optional(),
});

async function handleFetchExecution(url: string, maxBytes: number, req: Request, res: Response) {
  const reqId = `ftch_${crypto.randomBytes(6).toString('hex')}`;
  const startTime = Date.now();
  const ctx = getClientContext();
  const clientAgent = ctx.agent || req.header('user-agent') || 'api';

  traceRouteEvent('Proxy', {
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
    traceRouteEvent('Proxy', {
      event: 'ok',
      requestId: reqId,
      attempt: 1,
      platform: outcome.via || 'fetch',
      model: 'web_fetch',
      requestedModel: 'web_fetch',
      clientAgent,
      latencyMs,
    });
    res.json({
      url: outcome.url,
      via: outcome.via,
      title: outcome.title,
      text: outcome.text,
      truncated: outcome.truncated,
      ...(outcome.contentType ? { content_type: outcome.contentType } : {}),
    });
    return;
  }

  traceRouteEvent('Proxy', {
    event: 'fail',
    requestId: reqId,
    attempt: 1,
    platform: 'fetch',
    model: 'web_fetch',
    requestedModel: 'web_fetch',
    clientAgent,
    latencyMs,
    error: outcome.error,
  });

  res.status(outcome.status).json({
    error: {
      message: outcome.error,
      type: outcome.status === 400 ? 'invalid_request_error' : 'api_error',
    },
  });
}

toolsRouter.post('/fetch', async (req: Request, res: Response) => {
  if (!requireInferenceAuth(req, res)) return;
  const parsed = fetchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: 'Invalid fetch request: send {url, max_bytes?}', type: 'invalid_request_error' } });
    return;
  }
  const maxBytes = parsed.data.max_bytes ?? DEFAULT_MAX_BYTES;
  await handleFetchExecution(parsed.data.url, maxBytes, req, res);
});

// GET /v1/fetch?url=... or ?u=...
toolsRouter.get('/fetch', async (req: Request, res: Response) => {
  if (!requireInferenceAuth(req, res)) return;
  const rawUrl = typeof req.query.url === 'string' ? req.query.url : (typeof req.query.u === 'string' ? req.query.u : '');
  const url = rawUrl.trim();
  if (!url) {
    res.status(400).json({ error: { message: 'Invalid fetch request: `url` query parameter is required', type: 'invalid_request_error' } });
    return;
  }
  const maxBytes = req.query.max_bytes ? parseInt(String(req.query.max_bytes), 10) : DEFAULT_MAX_BYTES;
  await handleFetchExecution(url, maxBytes, req, res);
});
