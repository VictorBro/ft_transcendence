import { expect, test } from '@playwright/test';

import {
  formatViolations,
  isExpectedDocumentFailure,
  settle,
  watchConsole,
} from '../support/console-guard';
import { PAGE_ROUTES } from '../support/routes';

/**
 * Rejection criterion: no errors or warnings in the browser console on the
 * production build. One test per route so the report names the offender.
 */
test.describe('console gate', () => {
  for (const route of PAGE_ROUTES) {
    test(`${route.name} (${route.path}) logs nothing`, async ({ page }) => {
      // Before goto: listeners attached afterwards miss the load-time output.
      const violations = watchConsole(page);

      const expectedStatus = route.expectedStatus ?? 200;
      const response = await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      expect(response, `no response for ${route.path}`).not.toBeNull();
      expect(response?.status(), `${route.path} did not return ${expectedStatus}`).toBe(
        expectedStatus,
      );

      await settle(page);

      // The browser reports the main document's own non-2xx status as a
      // console.error. On a route that is supposed to answer 404 that line is
      // the status assertion above working, not the app breaking, so it is the
      // one message the gate tolerates. See isExpectedDocumentFailure.
      const unexpected = violations.filter(
        (violation) => !isExpectedDocumentFailure(violation, page.url(), expectedStatus),
      );

      expect(
        unexpected,
        `${route.path} produced browser console output:\n${formatViolations(unexpected)}\n`,
      ).toEqual([]);
    });
  }

  test('client-side navigation between pages stays silent', async ({ page }) => {
    const violations = watchConsole(page);

    await page.goto('/en', { waitUntil: 'domcontentloaded' });
    await settle(page);

    // The footer links are the Link from @/i18n/navigation, itself a next/link
    // wrapper, so this exercises the client router rather than a fresh document
    // load. Hydration errors surface here.
    //
    // Each step waits on the URL, not just on an h1: both pages have an h1, so
    // a heading assertion passes while the click's navigation is still in
    // flight. A goBack issued in that window backs out of the only committed
    // entry onto about:blank and the next click waits forever. toHaveURL
    // auto-retries until the navigation commits, which closes that race.
    const links: [string, string][] = [
      ['Privacy Policy', '/en/privacy'],
      ['Terms of Service', '/en/terms'],
    ];
    for (const [label, path] of links) {
      await page
        .getByRole('navigation', { name: 'Legal' })
        .getByRole('link', { name: label })
        .click();
      await expect(page).toHaveURL(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await settle(page);
      await page.goBack();
      await expect(page).toHaveURL('/en');
      await settle(page);
    }

    expect(
      violations,
      `client-side navigation produced browser console output:\n${formatViolations(violations)}\n`,
    ).toEqual([]);
  });
});
