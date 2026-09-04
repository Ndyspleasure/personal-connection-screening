import { defineConfig } from 'vitest/config';

/**
 * The public-journey E2E boots the built Next server and drives it over HTTP,
 * so the timeouts are generous: a cold `next start` plus a hermetic database
 * create + migrate can take a while on a shared CI runner.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.e2e.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 180_000,
    // The server is a shared, per-file singleton; never run files in parallel.
    fileParallelism: false,
    pool: 'forks',
  },
});
