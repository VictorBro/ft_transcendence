import type { Page, Request } from '@playwright/test';

import { formatViolations, watchConsole } from '../support/console-guard';
import { expect, ONBOARDED_COURSE, placeCourse, SECOND_COURSE, test } from '../support/session';

const home = `/en/learn/${ONBOARDED_COURSE.lang}`;

const isProfilePatch = (request: Request) =>
  request.method() === 'PATCH' && new URL(request.url()).pathname === '/api/users/me';

/** The server components of `path`, as router.refresh() and a client navigation fetch them. */
const isPageFetch = (request: Request, path: string) => {
  const headers = request.headers();
  return (
    request.method() === 'GET' &&
    headers.rsc === '1' &&
    !('next-router-prefetch' in headers) &&
    new URL(request.url()).pathname === path
  );
};

/** Past the next paint, so the effects of the last commit have run and sent their requests. */
const afterEffects = (page: Page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve))));

test.describe('time zone sync', () => {
  // Anything but the UTC every other spec runs in, so the new account differs.
  test.use({ timezoneId: 'Pacific/Honolulu' });

  test('stores the browser zone once, then never again', async ({ freshLearner: page }) => {
    // Through the API, so the first page under the course shell is the visit below.
    await placeCourse(page, ONBOARDED_COURSE);
    // The console gate runs in UTC, so this is the only spec where the sync runs.
    const violations = watchConsole(page);

    let patches = 0;
    page.on('request', (request) => {
      if (isProfilePatch(request)) patches += 1;
    });

    const patched = page.waitForResponse((response) => isProfilePatch(response.request()));
    // Fails the test if refresh() goes: the stored zone would stay UTC, and every page would PATCH.
    const refreshed = page.waitForResponse((response) => isPageFetch(response.request(), home));
    await page.goto(home);
    expect((await patched).status()).toBe(200);
    await refreshed;
    // A second PATCH would come from the render that refresh() causes.
    await afterEffects(page);
    expect(patches).toBe(1);

    const me = await page.request.get('/api/auth/me');
    expect((await me.json()).timeZone).toBe('Pacific/Honolulu');

    await page.goto(home);
    await page.waitForLoadState('networkidle');
    expect(patches).toBe(1);

    expect(violations, `the sync logged:\n${formatViolations(violations)}\n`).toEqual([]);
  });

  test('retries on the next page when the PATCH fails', async ({ freshLearner: page }) => {
    await placeCourse(page, SECOND_COURSE);
    await placeCourse(page, ONBOARDED_COURSE);

    // Only the first PATCH fails; the retry goes through to the API. A flag, not
    // `times: 1`: a GET on the same URL would use up the one time.
    let failNext = true;
    await page.route('**/api/users/me', (route) => {
      if (route.request().method() !== 'PATCH' || !failNext) return route.fallback();
      failNext = false;
      return route.fulfill({ status: 500 });
    });

    const failed = page.waitForResponse((response) => isProfilePatch(response.request()));
    await page.goto(home);
    expect((await failed).status()).toBe(500);

    // Client-side, so the course shell and TimeZoneSync stay mounted.
    const retried = page.waitForResponse((response) => isProfilePatch(response.request()));
    await page.getByRole('combobox', { name: 'Course' }).selectOption(SECOND_COURSE.lang);
    expect((await retried).status()).toBe(200);

    const me = await page.request.get('/api/auth/me');
    expect((await me.json()).timeZone).toBe('Pacific/Honolulu');
  });

  test('does not retry a zone the server rejects', async ({ freshLearner: page }) => {
    await placeCourse(page, SECOND_COURSE);
    await placeCourse(page, ONBOARDED_COURSE);

    // What the API answers for a zone its ICU does not know.
    await page.route('**/api/users/me', (route) =>
      route.request().method() === 'PATCH' ? route.fulfill({ status: 400 }) : route.fallback(),
    );

    let patches = 0;
    page.on('request', (request) => {
      if (isProfilePatch(request)) patches += 1;
    });

    const rejected = page.waitForResponse((response) => isProfilePatch(response.request()));
    await page.goto(home);
    expect((await rejected).status()).toBe(400);

    // The same client-side switch that retries after a 500.
    const switched = page.waitForResponse((response) =>
      isPageFetch(response.request(), `/en/learn/${SECOND_COURSE.lang}`),
    );
    const course = page.getByRole('combobox', { name: 'Course' });
    await course.selectOption(SECOND_COURSE.lang);
    await switched;
    // The switcher reads the URL, so this value means the new page is committed.
    await expect(course).toHaveValue(SECOND_COURSE.lang);
    await afterEffects(page);
    expect(patches).toBe(1);
  });
});
