import { devices, type BrowserContext, type Page } from '@playwright/test';
import { ensureCourse } from '../support/courses';
import { expectFitsTheScreen } from '../support/layout';
import { AUTHENTICATED_FOOTER_ROUTES, PUBLIC_FOOTER_ROUTES } from '../support/routes';
import { createAccount, identity, test as base } from '../support/session';

/**
 * 360px is the narrowest width worth gating: it is the most common Android
 * screen, and below the iPhone SE at 375. Pixel 5 supplies the rest of the
 * phone, its touch flags and its mobile user agent, with its width overridden
 * and `defaultBrowserType` left out. That last key is a worker option, so
 * spreading it would put this file in workers of its own for nothing.
 */
const { defaultBrowserType: _browser, ...phone } = devices['Pixel 5'];

/**
 * The longest name the schema allows, and the worst case for a layout: names
 * are letters, digits, dots, underscores and hyphens, so 32 characters can
 * arrive with nothing to break on. Unique per worker, because signup is.
 */
const longestDisplayName = (): string =>
  `browser${crypto.randomUUID().replace(/-/g, '').slice(0, 25)}`;

/**
 * An account of its own, rather than the shared one. The gate needs a learner
 * with a course and a maximal display name, and the shared account cannot
 * supply either: without a course /learn renders a short centred offer to start
 * instead of the two-pane layout and the dashboard header drops the
 * CourseSwitcher, and renaming it would leave dashboard.spec.ts asserting a
 * name the account no longer has. One signup per worker buys both.
 */
type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

const test = base.extend<{ learner: Page }, { maximalAccount: StorageState }>({
  maximalAccount: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      await createAccount(page, { ...identity(), displayName: longestDisplayName() });
      await ensureCourse(page, 'de', 30);

      const storageState = await context.storageState();
      await context.close();

      await use(storageState);
    },
    { scope: 'worker' },
  ],

  learner: async ({ browser, maximalAccount }, use) => {
    const context = await browser.newContext({ storageState: maximalAccount });
    await use(await context.newPage());
    await context.close();
  },
});

test.use({ ...phone, viewport: { width: 360, height: 800 } });

/**
 * Walks the route catalogues rather than naming the screens this was written
 * for. Those were already broken; the point of a gate is that the next one
 * cannot break unnoticed, and routes.ts already promises that adding a page
 * there is what puts it behind the gates.
 *
 * Deliberately only width. A layout that is wrong in an obvious way is caught
 * by opening the page, which is now part of review; what review does not catch
 * is a page overrunning by a few pixels, a route nobody thinks to open on a
 * phone, or content shut inside a pane whose scrollbar is hidden.
 */
test.describe('every page fits a phone screen', () => {
  for (const { path, name } of PUBLIC_FOOTER_ROUTES) {
    test(`the ${name} page fits`, async ({ page }) => {
      await page.goto(path);
      await expectFitsTheScreen(page, path);
    });
  }

  for (const { path, name } of AUTHENTICATED_FOOTER_ROUTES) {
    test(`the ${name} page fits when signed in`, async ({ learner }) => {
      await learner.goto(path);
      await expectFitsTheScreen(learner, path);
    });
  }
});
