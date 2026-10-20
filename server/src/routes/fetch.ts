// Dashboard surface for POST /v1/fetch (#1174 follow-up).
//
// The reader chain is no longer one opaque setting: routes/tools.ts walks the
// enabled rows of services/fetch-sources.ts (media_models, modality='fetch'),
// and this router exposes them to the cards.
//
//   GET  /api/fetch/config   legacy shape, kept for existing dashboards:
//                            { primary, effective, tinyfishKey }
//   PUT  /api/fetch/config   still accepts { primary: 'auto'|'tinyfish'|'jina' }
//   GET  /api/fetch/sources  the registry: id, platform, name, configured,
//                            quotaLabel, priority, enabled + live usage
//   GET  /api/fetch/usage    month/day attempt counters
//
// `primary` is kept as the preference hint the walker passes to
// fetchChainOrder(); the registry is now the source of truth for what can
// answer and in what order.

import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { getFetchUsage } from '../services/fetch-usage.js';
import {
  listFetchSources,
  resolveFetchConfig,
  type FetchConfigView,
} from '../services/fetch-sources.js';

export const fetchConfigRouter = Router();

const PRIMARY_VALUES = ['auto', 'tinyfish', 'jina'] as const;

const putSchema = z.object({ primary: z.enum(PRIMARY_VALUES) }).strict();

function currentPrimary(): FetchConfigView['primary'] {
  return resolveFetchConfig(process.env.FETCH_PRIMARY ?? 'auto').primary;
}

fetchConfigRouter.get('/', (_req: Request, res: Response) => {
  res.json(resolveFetchConfig(process.env.FETCH_PRIMARY ?? 'auto'));
});

fetchConfigRouter.put('/', (req: Request, res: Response) => {
  const parsed = putSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: "Invalid fetch config: send { primary: 'auto' | 'tinyfish' | 'jina' }", type: 'invalid_request_error' } });
    return;
  }
  process.env.FETCH_PRIMARY = parsed.data.primary;
  res.json(resolveFetchConfig(parsed.data.primary));
});

export const fetchRouter = Router();

// Counts as plain numbers so the cards can render on a fresh install without
// a first fetch having happened yet (missing rows would come back NaN).
fetchRouter.get('/usage', (_req: Request, res: Response) => {
  const { daily, monthly } = getFetchUsage();
  res.json({ monthly, today: daily });
});

// The reader chain as a registry, mirroring GET /api/search/engines on the
// dashboard side: one row per source with the status the cards badge and the
// published quota. `configured` is what can answer RIGHT NOW (TinyFish needs
// its key, Jina needs nothing); `preferred` is the legacy primary hint.
fetchRouter.get('/sources', (_req: Request, res: Response) => {
  const { daily, monthly } = getFetchUsage();
  const sources = listFetchSources();
  res.json({
    preferred: currentPrimary(),
    usage: { monthly, today: daily },
    sources: sources.map(source => ({
      id: source.sourceId,
      platform: source.platform,
      name: source.displayName,
      quotaLabel: source.quotaLabel,
      priority: source.priority,
      enabled: source.enabled,
      configured: source.configured,
      authKind: source.authKind,
    })),
  });
});
