import type { Page, Request } from '@playwright/test';

import { formatViolations, settle, watchConsole } from '../support/console-guard';
import { expect, ONBOARDED_COURSE, placeCourse, SECOND_COURSE, test } from '../support/session';
import { openMenu } from '../support/menu';

const home = (locale: string) => `/${locale}/learn/${ONBOARDED_COURSE.lang}`;

/** A PATCH of the locale only: TimeZoneSync sends its own to the same URL. */
const isLocalePatch = (request: Request) =>
  request.method() === 'PATCH' &&
  new URL(request.url()).pathname === '/api/users/me' &&
  'locale' in (request.postDataJSON() ?? {});

/** Past the next paint, so the effects of the last commit have run and sent their requests. */
const afterEffects = (page: Page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve))));

const storedLocale = async (page: Page) =>
  (await (await page.request.get('/api/auth/me')).json()).locale;

test.describe('locale sync', () => {
  test('stores the language the switcher picks, once', async ({ freshLearner: page }) => {
    // Through the API, so the first page under the course shell is the visit below.
    await placeCourse(page, SECOND_COURSE);
    await placeCourse(page, ONBOARDED_COURSE);

    let patches = 0;
    // On the context, so the second tab below is counted too.
    page.context().on('request', (request) => {
      if (isLocalePatch(request)) patches += 1;
    });

    // A new account is stored as en, so an English page has nothing to send.
    await page.goto(home('en'));
    await afterEffects(page);
    expect(patches).toBe(0);

    const violations = watchConsole(page);
    const patched = page.waitForResponse((response) => isLocalePatch(response.request()));
    await openMenu(page);
    await page.getByRole('combobox', { name: 'Language' }).selectOption('de');
    await expect(page).toHaveURL(home('de'));
    expect((await patched).status()).toBe(200);
    expect(await storedLocale(page)).toBe('de');

    // Client-side, so LocaleSync stays mounted with the en the layout gave it:
    // only what it kept from the PATCH stops a second one.
    await openMenu(page, 'Menü');
    const course = page.getByRole('combobox', { name: 'Kurs', includeHidden: true });
    await course.selectOption(SECOND_COURSE.lang);
    // The switcher reads the URL, so this value means the new page is committed.
    await expect(course).toHaveValue(SECOND_COURSE.lang);
    await afterEffects(page);
    expect(patches).toBe(1);

    // A new mount, in a second tab as time-zone.spec.ts does (#176): the layout
    // now reads de from the server.
    const next = await page.context().newPage();
    const nextViolations = watchConsole(next);
    await next.goto(home('de'));
    await settle(next);
    expect(patches).toBe(1);

    expect(violations, `the sync logged:\n${formatViolations(violations)}\n`).toEqual([]);
    expect(nextViolations, `the next visit logged:\n${formatViolations(nextViolations)}\n`).toEqual(
      [],
    );
  });

  test('retries on the next page when the PATCH fails', async ({ freshLearner: page }) => {
    await placeCourse(page, SECOND_COURSE);
    await placeCourse(page, ONBOARDED_COURSE);

    // Only the first PATCH fails. A flag, not `times: 1`: a GET on the same URL
    // would use up the one time.
    let failNext = true;
    await page.route('**/api/users/me', (route) => {
      if (!isLocalePatch(route.request()) || !failNext) return route.fallback();
      failNext = false;
      return route.fulfill({ status: 500 });
    });

    const failed = page.waitForResponse((response) => isLocalePatch(response.request()));
    await page.goto(home('fr'));
    expect((await failed).status()).toBe(500);

    // Client-side, so the course shell and LocaleSync stay mounted.
    const retried = page.waitForResponse((response) => isLocalePatch(response.request()));
    await openMenu(page);
    await page.getByRole('combobox', { name: 'Cours' }).selectOption(SECOND_COURSE.lang);
    expect((await retried).status()).toBe(200);
    expect(await storedLocale(page)).toBe('fr');
  });

  test('does not retry a locale the server rejects', async ({ freshLearner: page }) => {
    await placeCourse(page, SECOND_COURSE);
    await placeCourse(page, ONBOARDED_COURSE);

    await page.route('**/api/users/me', (route) =>
      isLocalePatch(route.request()) ? route.fulfill({ status: 400 }) : route.fallback(),
    );

    let patches = 0;
    page.on('request', (request) => {
      if (isLocalePatch(request)) patches += 1;
    });

    const rejected = page.waitForResponse((response) => isLocalePatch(response.request()));
    await page.goto(home('fr'));
    expect((await rejected).status()).toBe(400);

    // The same client-side switch that retries after a 500.
    await openMenu(page);
    const course = page.getByRole('combobox', { name: 'Cours', includeHidden: true });
    await course.selectOption(SECOND_COURSE.lang);
    await expect(course).toHaveValue(SECOND_COURSE.lang);
    await afterEffects(page);
    expect(patches).toBe(1);
  });
});
