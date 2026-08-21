import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

/**
 * Shared signed-in browser context for the specs that need one.
 *
 * Signing up per test racks up one argon2 password hash each, which under
 * parallel workers was slow enough to trip other tests' requests. Instead each
 * spec creates one account in a beforeAll hook and hands the saved cookie jar
 * to fresh, isolated contexts. Storage state is how Playwright does that
 * without re-running the login flow.
 */

const PASSWORD = 'Correct-Horse-9';

export interface Identity {
  email: string;
  displayName: string;
}

/**
 * A timestamp plus a small random suffix collides often enough across this many
 * parallel tests to fail signup on a reused email. A UUID does not. displayName
 * is capped at 32 characters, so only the first UUID segment is used there; the
 * full UUID is fine in the email local part.
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

export interface SignedIn {
  page: Page;
  /** Close this when the test ends; the context is not tracked anywhere else. */
  context: BrowserContext;
}

export interface SharedSession {
  /** Display name of the account, for specs that assert on the account nav. */
  displayName: string;
  /**
   * Hands back a fresh, isolated context signed in as the shared account, and
   * the context itself: nothing else holds a reference, so a caller that drops
   * it leaves a live browser profile behind for the rest of the run.
   */
  signedInPage: (browser: Browser) => Promise<SignedIn>;
}

/**
 * Creates one account and returns a handle that opens signed-in pages against
 * it. Call this once from a beforeAll hook; the returned object stays valid for
 * every test in the file.
 */
export const createSharedSession = async (browser: Browser): Promise<SharedSession> => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const fields = identity();

  await createAccount(page, fields);
  const storageState: Awaited<ReturnType<BrowserContext['storageState']>> =
    await context.storageState();
  await context.close();

  return {
    displayName: fields.displayName,
    signedInPage: async (target: Browser): Promise<SignedIn> => {
      const signedIn = await target.newContext({ storageState });
      return { page: await signedIn.newPage(), context: signedIn };
    },
  };
};
