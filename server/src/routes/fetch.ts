// Dashboard counter for POST /v1/fetch — the Web and Search cards show how
// much of the reader chain's free tier this box has burned this month/today.
// The reader chain (routes/tools.ts) has no engine rows to log against, so
// its tally lives in a settings blob (services/fetch-usage.ts) with lazy
// day/month rollover, exactly like the web-search tally it sits beside.

import { Router } from 'express';
import type { Request, Response } from 'express';
import { getFetchUsage } from '../services/fetch-usage.js';

export const fetchRouter = Router();

// Counts as plain numbers so the cards can render on a fresh install without
// a first fetch having happened yet (missing rows would come back NaN).
fetchRouter.get('/usage', (_req: Request, res: Response) => {
  const { daily, monthly } = getFetchUsage();
  res.json({ monthly, today: daily });
});
