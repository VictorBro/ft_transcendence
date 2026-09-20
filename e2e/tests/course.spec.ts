import type { Page } from '@playwright/test';

import { expect, test } from '../support/session';

/**
 * The account is worker-scoped and courses are never deleted, so a second test
 * asking for the same language gets a 409. Both are a usable start; anything
 * else means setup broke and every assertion after it would be meaningless.
 * The goal is then pinned, because a course left over from an earlier test
 * would otherwise decide it.
 */
async function ensureCourse(page: Page, lang: string, dailyGoal: number): Promise<void> {
  const created = await page.request.post('/api/courses', { data: { lang, dailyGoal } });
  expect([201, 409]).toContain(created.status());

  const pinned = await page.request.patch(`/api/courses/${lang}`, { data: { dailyGoal } });
  expect(pinned.status()).toBe(200);
}

/**
 * The fixture starts with no courses, so that state needs no setup. The rest
 * create one through the API: onboarding (#49) is the only UI that can, and it
 * does not exist yet.
 */
test.describe('course home', () => {
  test('a signed out visitor is sent to the login page', async ({ page }) => {
    await page.goto('/en/learn/de');
    await expect(page).toHaveURL(/\/login$/);
  });

  // A 404 would say the URL was wrong, which it is not.
  test('offers to start a language the learner does not study', async ({ signedIn }) => {
    await signedIn.goto('/en/learn/en');

    await expect(signedIn.getByText('You are not studying this language yet.')).toBeVisible();
    await expect(signedIn.getByRole('link', { name: 'Start this course' })).toBeVisible();
  });

  // Otherwise the select shows its first option and the header contradicts the page.
  test('the switcher shows no course when the page is one the learner has not started', async ({
    signedIn,
  }) => {
    await ensureCourse(signedIn, 'de', 30);
    await signedIn.goto('/en/learn/en');

    await expect(signedIn.getByRole('combobox', { name: 'Course' })).toHaveValue('');
  });

  test('an unlearnable language is a 404, not an offer to start it', async ({ signedIn }) => {
    const response = await signedIn.goto('/en/learn/zz');

    expect(response?.status()).toBe(404);
  });

  test('shows the course with its level and goal, and the switcher appears', async ({
    signedIn,
  }) => {
    await ensureCourse(signedIn, 'de', 30);
    await signedIn.goto('/en/learn/de');

    await expect(signedIn.getByRole('heading', { name: 'German' })).toBeVisible();
    // No placement yet, so the level is unset and the call to action is "take".
    await expect(signedIn.getByText('Not set yet')).toBeVisible();
    await expect(signedIn.getByRole('link', { name: 'Take the placement test' })).toBeVisible();

    await expect(signedIn.getByRole('combobox', { name: 'Daily goal' })).toHaveValue('30');
    // Only appears once there is something to switch between.
    await expect(signedIn.getByRole('combobox', { name: 'Course' })).toBeVisible();
  });

  // Surviving a reload is what separates a PATCH from a select that just moved.
  test('changing the daily goal persists', async ({ signedIn }) => {
    await ensureCourse(signedIn, 'fr', 10);
    await signedIn.goto('/en/learn/fr');

    await signedIn.getByRole('combobox', { name: 'Daily goal' }).selectOption('60');
    await expect(signedIn.getByRole('combobox', { name: 'Daily goal' })).toHaveValue('60');

    await signedIn.reload();
    await expect(signedIn.getByRole('combobox', { name: 'Daily goal' })).toHaveValue('60');
  });

  // The cookie is how /dashboard will know where to send the learner back to
  // (#52). Nothing reads it yet, so without this the middleware is unguarded.
  test('opening a course records it for next time', async ({ signedIn }) => {
    await ensureCourse(signedIn, 'de', 30);
    await ensureCourse(signedIn, 'fr', 10);

    const cookie = async () =>
      (await signedIn.context().cookies()).find((c) => c.name === 'ft.lang');

    await signedIn.goto('/en/learn/de');
    expect((await cookie())?.value).toBe('de');

    await signedIn.goto('/en/learn/fr');
    expect((await cookie())?.value).toBe('fr');

    // Not a course page, so it must leave the last one alone rather than clear it.
    await signedIn.goto('/en/dashboard');
    expect((await cookie())?.value).toBe('fr');
    // Only the server reads it.
    expect((await cookie())?.httpOnly).toBe(true);
  });

  // Every page reads its course from the URL, so two tabs share no state worth
  // fighting over. Same context, so they share cookies and the session.
  test('two tabs can sit on two different courses', async ({ signedIn }) => {
    await ensureCourse(signedIn, 'de', 30);
    await ensureCourse(signedIn, 'fr', 10);

    const second = await signedIn.context().newPage();
    try {
      await signedIn.goto('/en/learn/de');
      await second.goto('/en/learn/fr');

      await expect(second.getByRole('heading', { name: 'French' })).toBeVisible();
      await expect(second.getByRole('combobox', { name: 'Course' })).toHaveValue('fr');

      // The first tab is untouched by the second opening a different course.
      await signedIn.reload();
      await expect(signedIn.getByRole('heading', { name: 'German' })).toBeVisible();
      await expect(signedIn.getByRole('combobox', { name: 'Course' })).toHaveValue('de');
    } finally {
      await second.close();
    }
  });

  test('the switcher moves between courses', async ({ signedIn }) => {
    await ensureCourse(signedIn, 'de', 30);
    await ensureCourse(signedIn, 'fr', 10);
    await signedIn.goto('/en/learn/de');

    await signedIn.getByRole('combobox', { name: 'Course' }).selectOption('fr');

    await expect(signedIn).toHaveURL(/\/learn\/fr$/);
    await expect(signedIn.getByRole('heading', { name: 'French' })).toBeVisible();
  });
});
