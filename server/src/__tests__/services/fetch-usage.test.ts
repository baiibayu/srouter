import { describe, it, expect, beforeEach } from 'vitest';
import { initDb, setSetting } from '../../db/index.js';
import { getFetchUsage, recordFetchUsage } from '../../services/fetch-usage.js';

// POST /v1/fetch's local tally — one blob, both buckets rolled over lazily on
// read (the same contract as services/web-search.ts's usage blob).
describe('fetch usage counters', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
  });

  it('starts at zero on a fresh install', () => {
    expect(getFetchUsage()).toEqual({ daily: 0, monthly: 0 });
  });

  it('counts up per call', () => {
    recordFetchUsage();
    recordFetchUsage();
    recordFetchUsage();
    expect(getFetchUsage()).toEqual({ daily: 3, monthly: 3 });
  });

  it('rolls a stale day/month over on read', () => {
    recordFetchUsage();
    recordFetchUsage();
    setSetting('fetch_usage', JSON.stringify({ d: '2020-01-01', m: '2020-01', daily: 5, monthly: 9 }));
    expect(getFetchUsage()).toEqual({ daily: 0, monthly: 0 });
    recordFetchUsage();
    expect(getFetchUsage()).toEqual({ daily: 1, monthly: 1 });
  });

  it('restarts from zero when the blob is corrupt', () => {
    setSetting('fetch_usage', 'not-json{{');
    expect(getFetchUsage()).toEqual({ daily: 0, monthly: 0 });
    recordFetchUsage();
    expect(getFetchUsage()).toEqual({ daily: 1, monthly: 1 });
  });
});
