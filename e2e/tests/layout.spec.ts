import { devices } from '@playwright/test';
import { ensureCourse } from '../support/courses';
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

  test.describe('signed in', () => {
    /**
     * The fixture account starts with no courses, and that state renders the
     * wrong pages: /learn takes its course === null branch, which is a short
     * centred offer to start rather than the two-pane layout this gate exists
     * for, and the dashboard header drops the CourseSwitcher, which is the
     * widest thing the header ever has to fit. Both of the screens the fix
     * changed would have been measured in a state the fix does not touch.
     */
    test.beforeEach(async ({ signedIn }) => {
      await ensureCourse(signedIn, 'de', 30);
    });

    for (const { path, name } of AUTHENTICATED_FOOTER_ROUTES) {
      test(`the ${name} page fits`, async ({ signedIn }) => {
        await signedIn.goto(path);
        await expectFitsTheScreen(signedIn, path);
      });
    }
  });
});
