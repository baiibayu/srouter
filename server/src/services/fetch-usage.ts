// Local tally of successful POST /v1/fetch reads — the reader chain has no
// per-engine usage feed, so the dashboard shows these counts against the
// published free-tier allowances on the Web and Search cards. One JSON blob;
// both buckets roll over on read (mirrors services/web-search.ts's usage
// blob — same settings-table, same lazy rollover, just a single counter
// instead of one per backend).

import { getSetting, setSetting } from '../db/index.js';

const FETCH_USAGE_KEY = 'fetch_usage';

interface FetchUsageState {
  /** YYYY-MM-DD the daily bucket belongs to. */
  d: string;
  /** YYYY-MM the monthly bucket belongs to. */
  m: string;
  daily: number;
  monthly: number;
}

function usagePeriods(): { d: string; m: string } {
  const d = new Date().toISOString().slice(0, 10);
  return { d, m: d.slice(0, 7) };
}

function rollUsage(raw: string | undefined): FetchUsageState {
  const { d, m } = usagePeriods();
  let s: FetchUsageState = { d, m, daily: 0, monthly: 0 };
  if (raw) {
    try { s = JSON.parse(raw) as FetchUsageState; } catch { /* corrupt blob → start fresh */ }
  }
  if (s.d !== d) s.daily = 0;
  if (s.m !== m) s.monthly = 0;
  s.d = d;
  s.m = m;
  return s;
}

/** One fetch that cleared the SSRF guard — the counter runs after
 *  assertPublicHttpUrl, so blocked URLs never inflate it (they never reached
 *  the reader chain). Attempts count, successes or not: a 429 against Jina
 *  still burns the same free tier. */
export function recordFetchUsage(): void {
  const s = rollUsage(getSetting(FETCH_USAGE_KEY));
  s.daily += 1;
  s.monthly += 1;
  setSetting(FETCH_USAGE_KEY, JSON.stringify(s));
}

/** Counts for the current day/month; buckets roll over automatically. */
export function getFetchUsage(): { daily: number; monthly: number } {
  const s = rollUsage(getSetting(FETCH_USAGE_KEY));
  return { daily: s.daily, monthly: s.monthly };
}
