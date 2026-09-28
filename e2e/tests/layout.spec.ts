import { devices } from '@playwright/test';
import { expectFitsTheScreen } from '../support/layout';
import { AUTHENTICATED_FOOTER_ROUTES, PUBLIC_FOOTER_ROUTES } from '../support/routes';
import { test } from '../support/session';

/**
 * 360px is the narrowest width worth gating: it is the most common Android
 * screen, and below the iPhone SE at 375. Pixel 5 supplies the rest of the
 * phone, its touch flags and its mobile user agent, with its width overridden
 * and `defaultBrowserType` left out. That last key is a worker option, so
 * spreading it would put this file in workers of its own for nothing.
 */
const { defaultBrowserType: _browser, ...phone } = devices['Pixel 5'];

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
    // The onboarded account: a placed course and the longest display name allowed.
    test(`the ${name} page fits when signed in`, async ({ onboarded }) => {
      await onboarded.goto(path);
      await expectFitsTheScreen(onboarded, path);
    });
  }
});
