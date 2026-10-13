import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Insurance for the volume tests (bandit exploration runs 2000–3000
    // routing draws ≈ 4.5s at baseline) — a busy machine can still push a
    // sequential run past the 5s default. `npm test` runs files one at a
    // time (--fileParallelism=false), which is what keeps the wall-clock
    // hedge/bandit assertions honest; don't run vitest bare and parallel.
    testTimeout: 10_000,
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      enabled: process.env.COVERAGE === '1',
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**', 'src/db/migrate/**', 'src/scripts/**', 'src/index.ts'],
      reporter: ['text', 'text-summary'],
    },
  },
});
