import { defineConfig, devices } from '@playwright/test';

/**
 * Runs against the PRODUCTION compose stack, never against `next dev`.
 *
 * The console gate only means something on a production build: the dev server
 * emits hydration and fast-refresh warnings that would either fail every run or
 * force an allowlist wide enough to hide real regressions.
 *
 *   docker compose -f compose.yml -f compose.prod.yml up -d --build --wait
 *   pnpm --filter @ft/e2e run test:e2e
 *
 * No `webServer` block on purpose. Compose owns the lifecycle in both CI and
 * `make test-e2e`, and a second owner racing it produces "port already in use"
 * on some runs and a stale build on others.
 */

const baseURL = process.env.E2E_BASE_URL ?? 'https://localhost';

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: true,

  // A .only left in a spec silently narrows the suite to one test and the gate
  // still reports green.
  forbidOnly: Boolean(process.env.CI),

  // Zero retries by design. These specs assert on console output, so a retry
  // that passes second time is a flaky app, not a flaky test, and hiding it
  // defeats the gate.
  retries: 0,
  workers: process.env.CI ? 2 : undefined,

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    // Caddy signs with its own internal CA (`local_certs`), which no runner
    // trusts. Terminating TLS is still exercised; only the chain is skipped.
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
