import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

/**
 * Signing in, for the specs that need an account but are not testing signup.
 *
 * One account per worker, not per test and not per file: each signup writes a
 * row and runs argon2, and POST /auth/signup is limited to 30 a minute per
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
 * Fills the signup form and waits for the redirect to /onboarding, which only
 * happens once the account exists and the session cookie is set.
 */
export const createAccount = async (page: Page, fields: Identity): Promise<void> => {
  await page.goto('/signup');
  await page.getByLabel('Email', { exact: true }).fill(fields.email);
  await page.getByLabel('Display name', { exact: true }).fill(fields.displayName);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
};

export interface CourseFields {
  lang: string;
  level: string;
  dailyGoal: number;
}

/**
 * Starts a course through the API, with no level, as step one of onboarding
 * does. Courses are never deleted, so a second call for the same language gets
 * a 409; both are a usable start, anything else means setup broke.
 */
export const enrol = async (page: Page, lang: string, dailyGoal: number): Promise<void> => {
  const created = await page.request.post('/api/courses', { data: { lang, dailyGoal } });
  expect([201, 409]).toContain(created.status());
};

/**
 * A course the guards let through: started, then given a level. The goal is
 * pinned too, since a course left over from an earlier test would otherwise
 * decide it. Every write also makes `lang` the account's activeLang, so the
 * order of two calls decides where /learn lands without a cookie.
 */
export const placeCourse = async (page: Page, course: CourseFields): Promise<void> => {
  await enrol(page, course.lang, course.dailyGoal);

  const goal = await page.request.patch(`/api/courses/${course.lang}`, {
    data: { dailyGoal: course.dailyGoal },
  });
  expect(goal.status()).toBe(200);

  const level = await page.request.patch(`/api/courses/${course.lang}/level`, {
    data: { level: course.level },
  });
  expect(level.status()).toBe(200);
};

/** What every onboarded account studies. routes.ts opens its course home. */
export const ONBOARDED_COURSE = { lang: 'de', level: 'B1', dailyGoal: 30 } as const;

/** The one course tests may add to the onboarded account, shared so no spec drifts. */
export const SECOND_COURSE = { lang: 'fr', level: 'A2', dailyGoal: 10 } as const;

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

export interface Account {
  /** For specs that assert on the account nav. */
  displayName: string;
  storageState: StorageState;
}

/** Signs up in a throwaway context, runs `setUp` as that user, keeps the cookies. */
const newAccount = async (
  browser: Browser,
  setUp: (page: Page) => Promise<void> = async () => {},
): Promise<Account> => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const fields = identity();

  await createAccount(page, fields);
  await setUp(page);
  const storageState = await context.storageState();
  await context.close();

  return { displayName: fields.displayName, storageState };
};

/** A page in a fresh context restored from the account, closed however the test ends. */
const pageFor = async (
  browser: Browser,
  account: Account,
  use: (page: Page) => Promise<void>,
): Promise<void> => {
  const context = await browser.newContext({ storageState: account.storageState });
  await use(await context.newPage());
  // Teardown runs whether the test passed or threw, which hand-written
  // close() calls after the assertions do not.
  await context.close();
};

/**
 * The accounts are worker-scoped: created once, reused by every test that
 * worker runs. The pages are plain pages in a fresh context restored from one,
 * so tests stay isolated from each other while sharing the one signup. A fresh
 * context also starts without the ft.lang cookie, so /learn falls back to
 * activeLang until the test opens a course.
 *
 * Two of them, because the guards split the app in two. `account` never gets a
 * course: it is the learner every guard sends to onboarding, and a test that
 * started a course on it would break that for every later test in the worker.
 * `onboardedAccount` has ONBOARDED_COURSE placed, so the course home and
 * everything behind it render. Tests add at most SECOND_COURSE, always placed:
 * specs rely on it having no unplaced course and no English one.
 */
export const test = base.extend<
  { signedIn: Page; onboarded: Page; freshLearner: Page },
  { account: Account; onboardedAccount: Account }
>({
  account: [
    async ({ browser }, use) => {
      await use(await newAccount(browser));
    },
    { scope: 'worker' },
  ],

  onboardedAccount: [
    async ({ browser }, use) => {
      await use(await newAccount(browser, (page) => placeCourse(page, ONBOARDED_COURSE)));
    },
    { scope: 'worker' },
  ],

  signedIn: async ({ browser, account }, use) => {
    await pageFor(browser, account, use);
  },

  onboarded: async ({ browser, onboardedAccount }, use) => {
    await pageFor(browser, onboardedAccount, use);
  },

  /**
   * An account nobody else has touched. Creating a course cannot be undone, so
   * a test that needs a course without a level, or a specific set of courses,
   * would leave a shared account unusable for later tests. It pays the signup
   * cost the shared accounts exist to avoid, so use it only where a pristine
   * learner is the point.
   */
  freshLearner: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await createAccount(page, identity());
    await use(page);
    await context.close();
  },
});

export { expect };
