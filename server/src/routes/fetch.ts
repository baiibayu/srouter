// Dashboard counter for POST /v1/fetch — the Web and Search cards show how
// much of the reader chain's free tier this box has burned this month/today.
// The reader chain (routes/tools.ts) has no engine rows to log against, so
// its tally lives in a settings blob (services/fetch-usage.ts) with lazy
// day/month rollover, exactly like the web-search tally it sits beside.

import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { getFetchUsage } from '../services/fetch-usage.js';
import { getTinyfishApiKey } from '../services/web-search.js';

export const fetchConfigRouter = Router();

const PRIMARY_VALUES = ['auto', 'tinyfish', 'jina'] as const;
type PrimaryValue = (typeof PRIMARY_VALUES)[number];

function effectivePrimary(primary: PrimaryValue): 'tinyfish' | 'jina' {
  if (primary === 'tinyfish' || primary === 'auto') {
    if (getTinyfishApiKey()) return 'tinyfish';
  }
  return 'jina';
}

const putSchema = z.object({ primary: z.enum(PRIMARY_VALUES) }).strict();

fetchConfigRouter.get('/', (_req: Request, res: Response) => {
  const primary = (process.env.FETCH_PRIMARY ?? 'auto').trim() as PrimaryValue;
  const valid = PRIMARY_VALUES.includes(primary) ? primary : 'auto';
  res.json({
    primary: valid,
    effective: effectivePrimary(valid),
    tinyfishKey: getTinyfishApiKey() !== null,
  });
});

fetchConfigRouter.put('/', (req: Request, res: Response) => {
  const parsed = putSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: "Invalid fetch config: send { primary: 'auto' | 'tinyfish' | 'jina' }", type: 'invalid_request_error' } });
    return;
  }
  process.env.FETCH_PRIMARY = parsed.data.primary;
  res.json({
    primary: parsed.data.primary,
    effective: effectivePrimary(parsed.data.primary),
    tinyfishKey: getTinyfishApiKey() !== null,
  });
});

export const fetchRouter = Router();

// Counts as plain numbers so the cards can render on a fresh install without
// a first fetch having happened yet (missing rows would come back NaN).
fetchRouter.get('/usage', (_req: Request, res: Response) => {
  const { daily, monthly } = getFetchUsage();
  res.json({ monthly, today: daily });
});
