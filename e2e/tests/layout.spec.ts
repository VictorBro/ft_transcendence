import { devices } from '@playwright/test';
import { expectFitsTheScreen } from '../support/layout';
import { AUTHENTICATED_FOOTER_ROUTES, PUBLIC_FOOTER_ROUTES } from '../support/routes';
import { test } from '../support/session';

/**
 * Pixel 5 is 393px wide and chromium-backed, so this runs in the project the
 * suite already configures rather than pulling WebKit into CI for one file. It
 * is not the narrowest phone in use, but a layout that fits 393px fits the
 * ones above it, and nothing below it is common enough to gate on.
 */
test.use(devices['Pixel 5']);

/**
 * Walks the route catalogues rather than naming the screens this was written
 * for. Those were already broken; the point of a gate is that the next one
 * cannot break unnoticed, and routes.ts already promises that adding a page
 * there is what puts it behind the gates.
 *
 * Deliberately only width. A layout that is wrong in an obvious way is caught
 * by opening the page, which is now part of review; what review does not catch
 * is a page overrunning by a few pixels, or a route nobody thinks to open on a
 * phone at all.
 */
test.describe('every page fits a phone screen', () => {
  for (const { path, name } of PUBLIC_FOOTER_ROUTES) {
    test(`the ${name} page fits`, async ({ page }) => {
      await page.goto(path);
      await expectFitsTheScreen(page, path);
    });
  }

  for (const { path, name } of AUTHENTICATED_FOOTER_ROUTES) {
    test(`the ${name} page fits when signed in`, async ({ signedIn }) => {
      await signedIn.goto(path);
      await expectFitsTheScreen(signedIn, path);
    });
  }
});
