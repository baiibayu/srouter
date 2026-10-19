import { beforeEach, describe, expect, it } from 'vitest';
import type { ChatMessage } from '@baiibayu/srouter-shared/types.js';
import { initDb } from '../../db/index.js';
import {
  DEFAULT_COMPRESSION_CONFIG,
  getCompressionConfig,
  parseCompressionDirective,
  resolveCompressionMode,
  setCompressionConfig,
} from '../../services/compression/config.js';
import { checkFidelity } from '../../services/compression/fidelity-gate.js';
import {
  extractProtectedValues,
  hasProtectedSpan,
  mergeProtectedSpans,
  scanProtectedSpans,
} from '../../services/compression/preservation.js';
import {
  compressRequest,
  _clearPrefixFreezeForTesting,
} from '../../services/compression/pipeline.js';
import {
  decodeJsonTables,
  encodeJsonTable,
} from '../../services/compression/engines/jsoncompact.js';
import { clearCompressionStats, getCompressionStats } from '../../services/compression/stats.js';
import type { CompressionConfig, CompressionMode } from '../../services/compression/types.js';
import goldenCorpus from '../fixtures/compression-golden.json';
import { computeCacheKey } from '../../services/cache.js';

function config(mode: CompressionMode, patch: Partial<CompressionConfig> = {}): CompressionConfig {
  return {
    ...DEFAULT_COMPRESSION_CONFIG,
    ...patch,
    mode,
    engines: Object.fromEntries(
      Object.entries(DEFAULT_COMPRESSION_CONFIG.engines).map(([id, value]) => [id, { ...value }]),
    ),
  };
}

function msg(role: ChatMessage['role'], content: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { role, content, ...extra };
}

describe('compression configuration', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    delete process.env.SROUTER_COMPRESSION;
    initDb(':memory:');
  });

  it('uses setting → env → off precedence and persists complete engine defaults', () => {
    process.env.SROUTER_COMPRESSION = 'lossless';
    expect(getCompressionConfig().mode).toBe('lossless');
    const saved = setCompressionConfig({
      mode: 'standard',
      engines: { toolfilter: { enabled: true, intensity: 'aggressive' } },
    });
    expect(saved.mode).toBe('standard');
    expect(saved.engines.toolfilter.intensity).toBe('aggressive');
    expect(saved.engines.dedup.enabled).toBe(true);
  });

  it('treats global off as a master switch and only lets headers lower the mode', () => {
    expect(resolveCompressionMode(config('off'), parseCompressionDirective('aggressive'))).toBe('off');
    expect(resolveCompressionMode(config('aggressive'), parseCompressionDirective('lossless'))).toBe('lossless');
    expect(resolveCompressionMode(config('lossless'), parseCompressionDirective('aggressive'))).toBe('lossless');
    expect(resolveCompressionMode(config('standard'), parseCompressionDirective('off'))).toBe('off');
    expect(resolveCompressionMode(config('standard'), parseCompressionDirective('on'))).toBe('standard');
  });
});

describe('preservation and fidelity gate', () => {
  it('finds and merges overlapping protected spans idempotently', () => {
    const text = [
      'See https://example.com/api/v1 and /tmp/output.json.',
      '```ts',
      'const retries = 3;',
      '```',
      '@@ -1,3 +1,4 @@',
      'Error: failed at 42',
      '    at run (/app/index.js:10:2)',
    ].join('\n');
    const once = scanProtectedSpans(text);
    const twice = mergeProtectedSpans(once);
    expect(twice).toEqual(once);
    expect(extractProtectedValues(text, 'number')).toEqual(expect.arrayContaining(['3', '-1', '+1', '42']));
    expect(once.some(span => span.kinds.includes('fenced-code'))).toBe(true);
    expect(once.some(span => span.kinds.includes('diff-hunk'))).toBe(true);
  });

  it('hasProtectedSpan agrees with scanProtectedSpans and stays stateless across calls', () => {
    const corpus = [
      '',
      'plain line with nothing protected',
      'See https://example.com/api/v1 and /tmp/output.json.',
      '```ts\nconst retries = 3;\n```',
      '@@ -1,3 +1,4 @@\nError: failed at 42\n    at run (/app/index.js:10:2)',
      'Must preserve the authorization header.',
      'Never expose the access token.',
      'Important: retain the audit trail.',
      'Authorization is required for deletion.',
      'Permission checks must run first.',
      'Never trust an unsigned payload.',
      'Do not log the secret value.',
      'Always escape untrusted markup.',
      'Security warnings must stay visible.',
      'This constraint prohibits shell expansion.',
      'Authentication is required for changes.',
      'Never follow an untrusted redirect.',
      'Do not weaken the content policy.',
      'Always preserve the system instruction.',
      'Important constraints remain verbatim.',
      'Authorization rules must not be removed.',
      'Security policy requires least privilege.',
      '42 -1 +1 000 12345',
      'const retries = 3; // note: 7',
      'no secrets here, just prose about tokens and keys',
    ];
    // Interleave the two APIs the way the hot path does (per-line boolean
    // checks next to whole-blob scans) so a global-regex lastIndex drift in
    // either would surface as a disagreement.
    for (let round = 0; round < 200; round++) {
      for (const text of corpus) {
        expect(hasProtectedSpan(text)).toBe(scanProtectedSpans(text).length > 0);
      }
    }
    // Spot-check the two directions on concrete inputs.
    expect(hasProtectedSpan('plain line')).toBe(false);
    expect(hasProtectedSpan('https://example.com/api/v1')).toBe(true);
    expect(hasProtectedSpan('Error: boom at 42')).toBe(true);
    expect(hasProtectedSpan('    at run (/app/index.js:10:2)')).toBe(true);
    expect(hasProtectedSpan('Must preserve the authorization header.')).toBe(true);
  });

  it('rejects missing numbers, JSON keys, diff hunks, and inflation', () => {
    const before = [msg('tool', '{"count": 42}\n@@ -1 +1 @@\nError: boom')];
    expect(checkFidelity(before, [msg('tool', '{"count": 42}\nError: boom')]).accepted).toBe(false);
    expect(checkFidelity(before, [msg('tool', '{"other": 42}\n@@ -1 +1 @@\nError: boom')]).accepted).toBe(false);
    expect(checkFidelity(before, [msg('tool', '{"count": 7}\n@@ -1 +1 @@\nError: boom')]).accepted).toBe(false);
    expect(checkFidelity(before, [msg('tool', `${before[0].content as string} extra`)]).reason).toBe('inflation');
  });

  it('preserves every distinct explicit constraint or security line', () => {
    const constraints = [
      'Must preserve the authorization header.',
      'Never expose the access token.',
      'Do not bypass the permission check.',
      'Always validate the request origin.',
      'Security policy forbids anonymous writes.',
      'Important: retain the audit trail.',
      'Authorization is required for deletion.',
      'Permission checks must run first.',
      'Never trust an unsigned payload.',
      'Do not log the secret value.',
      'Always escape untrusted markup.',
      'Security warnings must stay visible.',
      'This constraint prohibits shell expansion.',
      'Authentication is required for changes.',
      'Never follow an untrusted redirect.',
      'Do not weaken the content policy.',
      'Always preserve the system instruction.',
      'Important constraints remain verbatim.',
      'Authorization rules must not be removed.',
      'Security policy requires least privilege.',
    ];
    const constraintResult = checkFidelity(
      [msg('system', constraints.join('\n'))],
      [msg('system', constraints.slice(1).join('\n'))],
    );
    expect(constraintResult.protectedTokenSurvival).toBe(0.95);
    expect(constraintResult.criticalLinesPreserved).toBe(false);
    expect(constraintResult.accepted).toBe(false);
  });
});

describe('compression engines', () => {
  beforeEach(() => {
    clearCompressionStats();
    _clearPrefixFreezeForTesting();
  });

  it('applies whitespace hygiene and exact block dedup in lossless mode', () => {
    const block = [
      'alpha beta gamma delta with enough repeated prose to qualify',
      'epsilon zeta eta theta with another deliberately long line',
      'iota kappa lambda mu and a third substantial repeated line',
    ].join('\n');
    const result = compressRequest([
      msg('system', 'Be useful.   \n\n\n\nBe precise.'),
      msg('user', `${block}\n\nquestion one`),
      msg('assistant', 'ack'),
      msg('user', `${block}\n\nquestion two`),
    ], { config: config('lossless'), recordStats: false });
    expect(result.messages[0].content).toBe('Be useful.\n\nBe precise.');
    expect(result.messages[3].content).toContain('[repeated from earlier in this conversation:');
    expect(result.stats.enginesApplied).toEqual(expect.arrayContaining(['dedup', 'lite']));
    expect(result.stats.discardedByGate).toEqual([]);
  });

  it('round-trips homogeneous JSON tables across varied values', () => {
    for (let seed = 0; seed < 25; seed += 1) {
      const rows = Array.from({ length: 8 + seed % 5 }, (_, index) => ({
        id: seed * 100 + index,
        name: `row-${seed}-${index}`,
        enabled: index % 2 === 0,
        meta: { group: seed % 3 },
        empty: null,
      }));
      const encoded = encodeJsonTable(rows);
      expect(encoded).not.toBeNull();
      expect(JSON.parse(decodeJsonTables(encoded!))).toEqual(rows);
    }
  });

  it('compacts pretty tabular JSON only when smaller and passes the trust gate', () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({
      id: index,
      provider: `provider-${index}`,
      healthy: true,
    }));
    const result = compressRequest([
      msg('assistant', null as unknown as string, {
        content: null,
        tool_calls: [{
          id: 'call_json',
          type: 'function',
          function: { name: 'fetch_rows', arguments: '{}' },
        }],
      }),
      msg('tool', JSON.stringify(rows, null, 2), { tool_call_id: 'call_json' }),
    ], { config: config('lossless'), recordStats: false });
    expect(result.messages[1].content).toContain('[[json-table:v1');
    expect(result.stats.enginesApplied).toContain('jsoncompact');
    expect(result.stats.discardedByGate).toEqual([]);
  });

  it('finds embedded JSON tables after malformed prose without rescanning nested arrays', () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      id: index,
      status: 'ready',
    }));
    const content = `log message with an unmatched " quote\npayload=${JSON.stringify({ rows }, null, 2)}`;
    const result = compressRequest([
      msg('tool', content),
    ], { config: config('lossless'), recordStats: false });
    expect(result.messages[0].content).toContain('[[json-table:v1');
    expect(result.stats.enginesApplied).toContain('jsoncompact');
    expect(result.stats.discardedByGate).toEqual([]);
  });

  it('filters long tool output while preserving every error, stack, number, path, and diff hunk', () => {
    const lines = [
      ...Array.from({ length: 220 }, () => 'building package alpha'),
      'Error: compilation failed',
      '    at build (/repo/src/build.ts:42:7)',
      '@@ -10,2 +10,3 @@',
      'exit_code=1',
    ];
    const result = compressRequest([
      msg('assistant', '', {
        tool_calls: [{
          id: 'call_build',
          type: 'function',
          function: { name: 'run_command', arguments: '{"command":"npm run build"}' },
        }],
      }),
      msg('tool', lines.join('\n'), { tool_call_id: 'call_build' }),
    ], { config: config('standard'), recordStats: false });
    const output = String(result.messages[1].content);
    expect(output).toContain('Error: compilation failed');
    expect(output).toContain('    at build (/repo/src/build.ts:42:7)');
    expect(output).toContain('@@ -10,2 +10,3 @@');
    expect(output).toContain('exit_code=1');
    expect(output.length).toBeLessThan(lines.join('\n').length);
    expect(result.stats.discardedByGate).toEqual([]);
  });

  it('supersedes an earlier read only when the later copy preserves protected facts', () => {
    const file = 'export const port = 4321;\n// /repo/src/config.ts\nexport const enabled = true;';
    const result = compressRequest([
      msg('assistant', '', { tool_calls: [{ id: 'r1', type: 'function', function: { name: 'read_file', arguments: '{"path":"/repo/src/config.ts"}' } }] }),
      msg('tool', file, { tool_call_id: 'r1' }),
      msg('assistant', '', { tool_calls: [{ id: 'r2', type: 'function', function: { name: 'read_file', arguments: '{"path":"/repo/src/config.ts"}' } }] }),
      msg('tool', file, { tool_call_id: 'r2' }),
    ], { config: config('standard'), recordStats: false });
    expect(result.messages[1].content).toContain('[read superseded');
    expect(result.messages[3].content).toBe(file);
  });

  it('freezes a recurring system prefix on its third appearance', () => {
    const cfg = config('lossless');
    const messages = [msg('system', 'Stable prefix.   \n\n\n\nKeep this spacing.'), msg('user', 'hello')];
    expect(compressRequest(messages, { config: cfg, recordStats: false }).messages[0].content)
      .toBe('Stable prefix.\n\nKeep this spacing.');
    compressRequest(messages, { config: cfg, recordStats: false });
    expect(compressRequest(messages, { config: cfg, recordStats: false }).messages[0].content)
      .toBe(messages[0].content);
  });

  it('counts prefix recurrence across requests, not duplicate messages or off-mode traffic', () => {
    const duplicated = 'Duplicate system prefix.   \n\n\n\nKeep one copy.';
    const first = compressRequest([
      msg('system', duplicated),
      msg('system', duplicated),
      msg('system', duplicated),
      msg('user', 'hello'),
    ], { config: config('lossless'), recordStats: false });
    expect(first.messages.filter(message => message.role === 'system')).toHaveLength(1);

    _clearPrefixFreezeForTesting();
    const offConfig = config('off');
    const messages = [msg('system', 'Off traffic.   \n\n\n\nTracker line.')];
    compressRequest(messages, { config: offConfig, recordStats: false });
    compressRequest(messages, { config: offConfig, recordStats: false });
    const enabled = compressRequest(messages, { config: config('lossless'), recordStats: false });
    expect(enabled.messages[0].content).toBe('Off traffic.\n\nTracker line.');
  });

  it('uses Unicode query terms when pruning multilingual history', () => {
    const cfg = config('aggressive');
    for (const engine of Object.values(cfg.engines)) engine.enabled = false;
    cfg.engines.relevance = { enabled: true, maxChars: 260 };
    const history = [
      '認証 エラー の診断結果は署名検証の失敗です。',
      ...Array.from({ length: 80 }, () => '無関係な古い履歴です。'),
    ].join('\n');
    const result = compressRequest([
      msg('assistant', history),
      msg('user', '認証 エラー を修正してください'),
    ], { config: cfg, recordStats: false });
    expect(result.messages[0].content).toContain('認証 エラー');
    expect(String(result.messages[0].content).length).toBeLessThan(history.length);
    expect(result.stats.enginesApplied).toEqual(['relevance']);
  });

  it('arms the aggressive adaptive ladder above the configured trigger unless a header lowers it', () => {
    const payload = 'unprotected context line\n'.repeat(400);
    const cfg = config('lossless', { autoTriggerEstTokens: 100 });
    const triggered = compressRequest([msg('user', payload)], { config: cfg, recordStats: false });
    expect(triggered.mode).toBe('aggressive');
    expect(triggered.stats.compressedChars).toBeLessThan(triggered.stats.originalChars);
    const lowered = compressRequest([msg('user', payload)], {
      config: cfg,
      header: 'lossless',
      recordStats: false,
    });
    expect(lowered.mode).toBe('lossless');
  });

  it('keeps rolling aggregate stats without retaining request bodies', () => {
    compressRequest([msg('user', 'hello   \n\n\n\nworld')], { config: config('lossless') });
    const stats = getCompressionStats();
    expect(stats.requests).toBe(1);
    expect(stats.compressedRequests).toBe(1);
    expect(JSON.stringify(stats)).not.toContain('hello');
  });

  it('keeps compression modes/config versions isolated in response-cache keys', () => {
    const messages = [msg('user', 'same prompt')];
    expect(computeCacheKey({ model: 'auto', messages, compression: 'off:v1' }))
      .not.toBe(computeCacheKey({ model: 'auto', messages, compression: 'lossless:v1' }));
  });

  it('runs the scrubbed coding-agent golden corpus with no lossless gate violations', () => {
    let savedChars = 0;
    for (const fixture of goldenCorpus) {
      const result = compressRequest(fixture.messages as ChatMessage[], {
        config: config('lossless'),
        recordStats: false,
      });
      expect(result.stats.discardedByGate, fixture.name).toEqual([]);
      expect(checkFidelity(fixture.messages as ChatMessage[], result.messages).accepted, fixture.name).toBe(true);
      savedChars += result.stats.originalChars - result.stats.compressedChars;
    }
    expect(savedChars).toBeGreaterThan(0);
  });

  // The wall-clock caps below are calibrated to GitHub's hosted runners, where
  // they gate every push. Off CI they are only a courtesy, and a laptop
  // running the suite inside Docker measures 2-3x slower than a runner (an
  // outside verification on Node 22 saw a 10-11 ms median and 252-277 ms on
  // the linearity payload), so the same numbers there only produce false
  // failures. Loosen them where nothing depends on them; CI keeps them exact.
  // The coverage leg is instrumented by v8, which inflates these timings by
  // roughly 2-3x, so it gets the same slack as a laptop. The uninstrumented
  // matrix leg still holds the exact caps.
  //
  // The fixed off-CI 3x slack proved too small when the suite runs many files
  // in parallel on a loaded machine: OS preemption stretches EVERY synchronous
  // measurement roughly proportionally (the motivating run measured p50 at
  // 24.3 ms, just over 8*3, and 901 ms on the linearity payload, over 250*3).
  // Slack is therefore machine-relative off CI: time one fixed built-in-only
  // workload (JSON parse/stringify + regex scan — deliberately NO production
  // code, so a compression regression cannot inflate its own budget) once per
  // file, the same way the budgets time compressRequest, and scale the caps
  // by how much slower than a calm machine this process currently is. A
  // loaded-but-proportional machine passes; a regression still fails at the
  // same calm-equivalent thresholds as the old fixed 3x: budgets exceed 3x
  // the CI caps — p50 > 24 ms, p99 and the adversarial single shots > 75 ms,
  // and the linearity payload > 750 ms (~2.7x its typical calm 250-280 ms
  // time) — because the calibration (built-ins only) never moves when
  // production code slows down. Calibration tracks the LEVEL of machine load;
  // it cannot see one-off OS/GC spikes (a standalone run once hit 117 ms on
  // one of twelve 100 KB samples while steady-state was ~8 ms), so the two
  // low-headroom tail statistics — the p99 and the linearity single shots —
  // are medians of three independent repetitions: one spiked repetition is
  // outvoted, while a real regression slows every repetition and still fails.
  // The adversarial 25 ms singles keep ~5-15x calm headroom and stay
  // single-shot. v8 coverage instruments src/ but not this excluded test
  // file, which would skew the ratio low, so coverage runs keep the fixed
  // 3x instead of trusting the calibration.
  // CALM_CALIBRATION_MS: median of the workload below on the calm reference
  // machine (Node 22 laptop; three consecutive runs: 7.3 / 8.2 / 8.4 ms).
  const CALM_CALIBRATION_MS = 8;
  function calibrateCpuSpeed(): number {
    const source = JSON.stringify(Array.from({ length: 512 }, (_, i) => ({
      id: i,
      name: `row-${i}`,
      enabled: i % 2 === 0,
      note: `status update ${i} at /var/log/app-${i}.log`,
    })));
    const samples: number[] = [];
    for (let round = 0; round < 21; round += 1) {
      const started = performance.now();
      for (let n = 0; n < 8; n += 1) {
        const rows = JSON.parse(source) as { name: string; note: string }[];
        const text = rows.map(row => `${row.name} ${row.note}`).join('\n');
        void /status update \d+/.test(text);
        void JSON.stringify(rows);
      }
      samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    return samples[Math.floor(samples.length / 2)];
  }
  let slack: number;
  if (process.env.CI && process.env.COVERAGE !== '1') {
    slack = 1; // hosted runner: exact caps, machine-independent.
  } else if (process.env.COVERAGE === '1') {
    slack = 3; // v8 skews the calibration ratio; keep the historical fixed slack.
  } else {
    // Never below the old fixed 3x (a machine faster than the reference keeps
    // today's headroom; load only ever widens the budgets proportionally).
    slack = Math.max(3, (3 * calibrateCpuSpeed()) / CALM_CALIBRATION_MS);
  }
  const medianOf = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

  it('stays within the 100 KB synchronous performance budget', () => {
    const payload = `${'plain status line without protected tokens\n'.repeat(2_500)}tail`;
    const runOnce = () => {
      const started = performance.now();
      compressRequest([msg('tool', payload)], { config: config('lossless'), recordStats: false });
      return performance.now() - started;
    };
    // Three independent batches of twelve: the p50 is the median of the
    // batch medians (tight guard, as before), and the p99 is the MEDIAN of
    // the three batch maxes — one batch catching a transient OS/GC spike
    // cannot fail the tail budget by itself, but a real regression slows
    // every batch's max and still fails.
    const batchP50s: number[] = [];
    const batchP99s: number[] = [];
    for (let batch = 0; batch < 3; batch += 1) {
      const samples: number[] = [];
      for (let run = 0; run < 12; run += 1) samples.push(runOnce());
      samples.sort((a, b) => a - b);
      batchP50s.push(samples[Math.floor(samples.length * 0.5)]);
      batchP99s.push(samples[samples.length - 1]);
    }
    const p50 = medianOf(batchP50s);
    const p99 = medianOf(batchP99s);
    // Hosted-runner CPU scheduling and Node majors add enough jitter to make
    // 5 ms flaky (Node 22 measured 5.54–5.77 ms in otherwise-green CI runs).
    // Keep a tight median guard while the p99/adversarial 25 ms caps below
    // continue to catch material synchronous regressions.
    expect(p50).toBeLessThan(8 * slack);
    expect(p99).toBeLessThan(25 * slack);

    const unbalancedJson = '['.repeat(100_000);
    const adversarialStarted = performance.now();
    compressRequest([msg('tool', unbalancedJson)], {
      config: config('lossless'),
      recordStats: false,
    });
    expect(performance.now() - adversarialStarted).toBeLessThan(25 * slack);

    const manyBalancedArrays = '[]'.repeat(50_000);
    const balancedStarted = performance.now();
    compressRequest([msg('tool', manyBalancedArrays)], {
      config: config('lossless'),
      recordStats: false,
    });
    expect(performance.now() - balancedStarted).toBeLessThan(25 * slack);
  });

  it('stays linear on protected-token-heavy adversarial payloads', () => {
    // A stack-trace-detected rule skips head/tail trimming, so the char-budget
    // pass sees every line; this payload once made it quadratic.
    const traceLines = ['Traceback (most recent call last)'];
    for (let i = 0; i < 20_000; i += 1) {
      traceLines.push(`processing item alpha beta gamma delta run ${'x'.repeat(20)}${i.toString(36)}`);
    }
    const call = (content: string) => compressRequest([
      msg('assistant', '', {
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'run_command', arguments: '{"command":"python x.py"}' } }],
      }),
      msg('tool', content, { tool_call_id: 'c1' }),
    ], { config: config('standard'), recordStats: false });
    // Median-of-3: the 250 ms cap leaves only ~3x calm headroom here, so a
    // single spiked repetition under parallel-worker load would fail a
    // single-shot measurement even with calibrated slack. A real regression
    // slows all three repetitions and still fails.
    const timed = (content: string) => medianOf(Array.from({ length: 3 }, () => {
      const started = performance.now();
      call(content);
      return performance.now() - started;
    }));
    expect(timed(traceLines.join('\n'))).toBeLessThan(250 * slack);

    // Distinct numeric literals are the highest-cardinality protected kind;
    // the fidelity survival scan once rescanned the output per literal.
    const numberLines: string[] = [];
    for (let i = 0; i < 12_000; i += 1) numberLines.push(`metric row ${i * 7 + 1_000_003} value ok`);
    expect(timed(numberLines.join('\n'))).toBeLessThan(250 * slack);
  });
});
