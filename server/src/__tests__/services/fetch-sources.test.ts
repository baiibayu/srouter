import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { initDb, getDb, setSetting } from '../../db/index.js';
import { setWebSearchConfig } from '../../services/web-search.js';
import {
  fetchChainOrder,
  fetchSourceAuthKind,
  isFetchSourceConfigured,
  listFetchSources,
  resolveFetchConfig,
} from '../../services/fetch-sources.js';

// The /v1/fetch reader registry and the order POST /v1/fetch walks. The rows
// are seeded by 20261020_000001_seed_local_fetch_sources.ts; `configured` is
// what can answer right now, which is all the cards and the public
// GET /v1/fetch/sources publish.
describe('fetch sources', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    delete process.env.FETCH_PRIMARY;
  });

  afterEach(() => {
    setWebSearchConfig({ tinyfishKey: null });
    delete process.env.FETCH_PRIMARY;
  });

  it('seeds the two readers in order with their real quotas', () => {
    const sources = listFetchSources();
    expect(sources.map(s => s.sourceId)).toEqual(['tinyfish-fetch', 'jina-reader']);
    expect(sources.map(s => s.platform)).toEqual(['tinyfish', 'jina']);
    expect(sources[0].quotaLabel).toBe('free 1,000 URLs/day · 150 URLs/min');
    expect(sources[1].quotaLabel).toBe('keyless · 20 RPM without a key');
    expect(sources.every(s => s.enabled)).toBe(true);
  });

  it('computes configured from what each reader needs', () => {
    expect(isFetchSourceConfigured('tinyfish')).toBe(false);
    expect(isFetchSourceConfigured('jina')).toBe(true);
    expect(isFetchSourceConfigured('unknown-reader')).toBe(false);

    setWebSearchConfig({ tinyfishKey: 'tf-secret' });
    expect(listFetchSources().find(s => s.platform === 'tinyfish')?.configured).toBe(true);
  });

  it('says what a source needs before it can answer', () => {
    expect(fetchSourceAuthKind('tinyfish')).toBe('key');
    expect(fetchSourceAuthKind('jina')).toBe('none');
    // Anything else is assumed to be the operator's own endpoint (SearXNG-style).
    expect(fetchSourceAuthKind('own-reader')).toBe('instance');
  });

  it('starts with the keyless reader while TinyFish has no key', () => {
    expect(fetchChainOrder('auto')).toEqual(['jina', 'tinyfish']);
  });

  it('puts TinyFish first once its key is stored', () => {
    setWebSearchConfig({ tinyfishKey: 'tf-secret' });
    expect(fetchChainOrder('auto')[0]).toBe('tinyfish');
    expect(fetchChainOrder('auto')).toHaveLength(2);
  });

  it('honours an explicit pin only when that reader can answer', () => {
    // Pinned TinyFish with no key cannot answer → Jina still leads.
    expect(fetchChainOrder('tinyfish')).toEqual(['jina', 'tinyfish']);
    setWebSearchConfig({ tinyfishKey: 'tf-secret' });
    expect(fetchChainOrder('tinyfish')).toEqual(['tinyfish', 'jina']);
    expect(fetchChainOrder('jina')).toEqual(['jina', 'tinyfish']);
  });

  it('keeps the legacy config shape truthful', () => {
    expect(resolveFetchConfig('auto')).toEqual({ primary: 'auto', effective: 'jina', tinyfishKey: false });
    expect(resolveFetchConfig('tinyfish')).toEqual({ primary: 'tinyfish', effective: 'jina', tinyfishKey: false });
    // A garbage env value degrades to auto instead of throwing.
    expect(resolveFetchConfig('nonsense').primary).toBe('auto');

    setWebSearchConfig({ tinyfishKey: 'tf-secret' });
    expect(resolveFetchConfig('auto')).toEqual({ primary: 'auto', effective: 'tinyfish', tinyfishKey: true });
  });

  it('skips a source the operator switched off', () => {
    getDb().prepare("UPDATE media_models SET enabled = 0 WHERE modality = 'fetch' AND platform = 'tinyfish'").run();
    expect(fetchChainOrder('tinyfish')).toEqual(['jina']);
    expect(listFetchSources().find(s => s.platform === 'tinyfish')?.enabled).toBe(false);
  });

  it('lets a stored reorder override the seeded priority', () => {
    setSetting('fetch_source_priority', JSON.stringify({ 'tinyfish:tinyfish-fetch': 1, 'jina:jina-reader': 0 }));
    expect(listFetchSources().map(s => s.platform)).toEqual(['jina', 'tinyfish']);
  });

  it('falls back to the historical pair order on a registry with no rows', () => {
    getDb().prepare("DELETE FROM media_models WHERE modality = 'fetch'").run();
    expect(fetchChainOrder('auto')).toEqual(['jina', 'tinyfish']);
    setWebSearchConfig({ tinyfishKey: 'tf-secret' });
    expect(fetchChainOrder('auto')).toEqual(['tinyfish', 'jina']);
  });
});
