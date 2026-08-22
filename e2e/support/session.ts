import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';

/**
 * Signing in, for the specs that need an account but are not testing signup.
 *
 * One account per worker, not per test and not per file: each signup writes a
 * row and runs argon2, and POST /auth/signup is limited to 10 a minute per
 * address, so a suite that signs up per test spends its budget on setup and
 * starts failing on a 429 it never asked for.
 *
 * Exposed as fixtures rather than helpers so teardown is Playwright's problem.
 * A context closed by hand at the end of a test leaks whenever an assertion
 * above it throws, which is exactly when the run is already going badly.
 */

/** Shared by the signup helper below and by auth.spec.ts, which signs in with it. */
export const PASSWORD = 'Correct-Horse-9';

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
  await expect(page).toHaveURL(/\/profile$/);
};

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

export interface Account {
  /** For specs that assert on the account nav. */
  displayName: string;
  storageState: StorageState;
}

/**
 * `account` is worker-scoped: created once, reused by every test that worker
 * runs. `signedIn` is a plain page in a fresh context restored from it, so
 * tests stay isolated from each other while sharing the one signup.
 */
export const test = base.extend<{ signedIn: Page }, { account: Account }>({
  account: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const fields = identity();

      await createAccount(page, fields);
      const storageState = await context.storageState();
      await context.close();

      await use({ displayName: fields.displayName, storageState });
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
