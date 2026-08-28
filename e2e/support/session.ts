import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';

/**
 * Signing in, for the specs that need an account but are not testing signup.
 *
 * ONE account for the whole run, signed up in global-setup.ts. Not one per
 * test, and no longer one per worker either: each signup writes a row, runs
 * argon2, and spends from a budget of 10 a minute per address that the workers
 * share, because they all reach the API through the same Caddy. Worker-scoped
 * made the suite's signup count 6 + cores/2 -- see global-setup.ts for why that
 * passes on one machine and 429s on another.
 *
 * Exposed as fixtures rather than helpers so teardown is Playwright's problem.
 * A context closed by hand at the end of a test leaks whenever an assertion
 * above it throws, which is exactly when the run is already going badly.
 */

/** Shared by the signup helper below and by auth.spec.ts, which signs in with it. */
export const PASSWORD = 'Correct-Horse-9';

/**
 * Where global-setup.ts leaves the shared account for the `account` fixture.
 * Resolved against this file, not the cwd, which is Playwright's for the config
 * and the launcher's for a worker. Gitignored: it holds a live session cookie,
 * and it is stale the moment `make test-e2e` deletes the row it belongs to.
 */
export const ACCOUNT_STATE_FILE = join(__dirname, '..', '.auth', 'account.json');

export interface Identity {
  email: string;
  displayName: string;
}

/**
 * A timestamp plus a small random suffix collides often enough across this many
 * parallel tests to fail signup on a reused email. A UUID does not. displayName
 * is capped at 32 characters, so only the first UUID segment is used there; the
 * full UUID is fine in the email local part.
 *
 * The `browser-` prefix is what `make test-e2e` matches to delete these rows
 * afterwards. Keep it in step with E2E_EMAIL_PREFIX in the Makefile.
 */
export const identity = (): Identity => {
  const stamp = crypto.randomUUID();
  return { email: `browser-${stamp}@example.com`, displayName: `browser${stamp.split('-')[0]}` };
};

/**
 * Fills the signup form and waits for the redirect to /profile, which only
 * happens once the account exists and the session cookie is set.
 */
export const createAccount = async (page: Page, fields: Identity): Promise<void> => {
  await page.goto('/signup');
  await page.getByLabel('Email', { exact: true }).fill(fields.email);
  await page.getByLabel('Display name', { exact: true }).fill(fields.displayName);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  // Explicit rather than the 10s in playwright.config.ts, because global-setup
  // calls this outside the runner, where `expect` falls back to its own 5s
  // default. Signup runs argon2, which is meant to be slow.
  await expect(page).toHaveURL(/\/profile$/, { timeout: 15_000 });
};

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

export interface Account {
  /** For specs that assert on the account nav. */
  displayName: string;
  storageState: StorageState;
}

/**
 * `account` is the file global-setup.ts wrote, read once per worker. `signedIn`
 * is a plain page in a fresh context restored from it, so tests stay isolated
 * from each other while sharing the one signup. Nothing that takes `signedIn`
 * mutates the account, which is what makes one row safe to share; a spec that
 * renames or deletes it needs its own, as auth.spec.ts already does.
 */
export const test = base.extend<{ signedIn: Page }, { account: Account }>({
  account: [
    // Playwright requires the first argument to be a destructuring pattern even
    // when a fixture depends on nothing, which is what trips no-empty-pattern.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      // No try/catch: the only way this file is missing is global setup not
      // having run, and its own failure is the message worth reading.
      await use(JSON.parse(await readFile(ACCOUNT_STATE_FILE, 'utf8')) as Account);
    },
    { scope: 'worker' },
  ],

  signedIn: async ({ browser, account }, use) => {
    const context = await browser.newContext({ storageState: account.storageState });
    await use(await context.newPage());
    // Teardown runs whether the test passed or threw, which hand-written
    // close() calls after the assertions do not.
    await context.close();
  },
});

export { expect };
