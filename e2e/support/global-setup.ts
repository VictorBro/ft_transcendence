import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { chromium, type FullConfig } from '@playwright/test';

import { ACCOUNT_STATE_FILE, createAccount, identity } from './session';

/**
 * Creates the one account the whole run shares, before any worker starts.
 *
 * This exists for a rate limit, not for speed. POST /auth/signup allows 10 a
 * minute per client address and every worker reaches the API through the same
 * Caddy, so the suite spends one budget between them: 6 on the signup flows
 * auth.spec.ts actually tests, and previously one more per worker. Playwright's
 * default worker count is half the machine's logical cores, so that total was
 * 6 + cores/2 -- green on an 8-core laptop and 429 on a 12-core lab machine,
 * where the fixture signup failed in tests that had nothing to do with signup.
 * Doing it once here makes it 7 on every machine.
 *
 * Not a globalTeardown: `make test-e2e` deletes every browser-* row after the
 * run, whether or not the suite passed, and doing it in both places would race.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  // Resolved, so this picks up the top-level `use` block: E2E_BASE_URL points
  // at https://caddy from inside the devcontainer and https://localhost from a
  // host shell, and ignoreHTTPSErrors is what makes Caddy's internal CA usable.
  const { baseURL, ignoreHTTPSErrors } = config.projects[0].use;

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL, ignoreHTTPSErrors });
    const fields = identity();

    await createAccount(await context.newPage(), fields);

    // Written whole rather than via storageState({ path }), because the specs
    // need the display name too and a second file would be one more thing to
    // keep in step.
    await mkdir(dirname(ACCOUNT_STATE_FILE), { recursive: true });
    await writeFile(
      ACCOUNT_STATE_FILE,
      JSON.stringify({
        displayName: fields.displayName,
        storageState: await context.storageState(),
      }),
      'utf8',
    );

    await context.close();
  } finally {
    await browser.close();
  }
}
