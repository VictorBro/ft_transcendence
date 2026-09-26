import {
  enrol,
  expect,
  ONBOARDED_COURSE,
  placeCourse,
  SECOND_COURSE,
  test,
} from '../support/session';

/**
 * The course home only renders a placed course, so everything here runs as
 * the onboarded account, except the redirects that need a learner without one.
 */
test.describe('course home', () => {
  test('a signed out visitor is sent to the login page', async ({ page }) => {
    await page.goto('/en/learn/de');
    await expect(page).toHaveURL(/\/login$/);
  });

  // A 404 would say the URL was wrong, which it is not: the language is real,
  // the learner just does not study it yet.
  test('a language the learner does not study opens onboarding with it picked', async ({
    onboarded,
  }) => {
    await onboarded.goto('/en/learn/en');

    await expect(onboarded).toHaveURL(/\/en\/onboarding\?lang=en$/);
    await expect(onboarded.getByRole('radio', { name: 'English' })).toBeChecked();
  });

  // With two unplaced courses, onboarding alone would pick the newer one.
  test('a course with no level opens its own level step', async ({ freshLearner }) => {
    await enrol(freshLearner, 'de', 30);
    await enrol(freshLearner, 'fr', 10);

    await freshLearner.goto('/en/learn/de');

    await expect(freshLearner).toHaveURL(/\/en\/onboarding\?lang=de$/);
    await expect(freshLearner.getByRole('heading', { name: 'Deutsch' })).toBeVisible();
  });

  test('an unlearnable language is a 404, not onboarding', async ({ onboarded }) => {
    const response = await onboarded.goto('/en/learn/zz');

    expect(response?.status()).toBe(404);
  });

  test('shows the course with its level and goal, and the switcher appears', async ({
    onboarded,
  }) => {
    await onboarded.goto(`/en/learn/${ONBOARDED_COURSE.lang}`);

    await expect(onboarded.getByRole('heading', { name: 'German' })).toBeVisible();
    await expect(onboarded.getByText(ONBOARDED_COURSE.level, { exact: true })).toBeVisible();
    await expect(onboarded.getByRole('link', { name: 'Retake the placement test' })).toBeVisible();

    await expect(onboarded.getByRole('combobox', { name: 'Daily goal' })).toHaveValue(
      String(ONBOARDED_COURSE.dailyGoal),
    );
    await expect(onboarded.getByRole('combobox', { name: 'Course' })).toHaveValue(
      ONBOARDED_COURSE.lang,
    );
  });

  // Surviving a reload is what separates a PATCH from a select that just moved.
  test('changing the daily goal persists', async ({ onboarded }) => {
    await placeCourse(onboarded, SECOND_COURSE);
    await onboarded.goto('/en/learn/fr');

    await onboarded.getByRole('combobox', { name: 'Daily goal' }).selectOption('60');
    await expect(onboarded.getByRole('combobox', { name: 'Daily goal' })).toHaveValue('60');

    await onboarded.reload();
    await expect(onboarded.getByRole('combobox', { name: 'Daily goal' })).toHaveValue('60');
  });

  // The cookie is how /learn knows which course to send the learner back to.
  test('opening a course records it for next time', async ({ onboarded }) => {
    await placeCourse(onboarded, SECOND_COURSE);

    const cookie = async () =>
      (await onboarded.context().cookies()).find((c) => c.name === 'ft.lang');

    await onboarded.goto('/en/learn/de');
    expect((await cookie())?.value).toBe('de');

    await onboarded.goto('/en/learn/fr');
    expect((await cookie())?.value).toBe('fr');

    // Next prefetches the links on a course page. Those sit under /learn/<lang>
    // too, and a link the learner only saw must not count as opening it.
    await onboarded.request.get('/en/learn/de/placement');
    expect((await cookie())?.value).toBe('fr');

    // Not a course page, so it must leave the last one alone rather than clear it.
    await onboarded.goto('/en/profile');
    expect((await cookie())?.value).toBe('fr');
    // Only the server reads it.
    expect((await cookie())?.httpOnly).toBe(true);
  });

  // Every page reads its course from the URL, so two tabs share no state worth
  // fighting over. Same context, so they share cookies and the session.
  test('two tabs can sit on two different courses', async ({ onboarded }) => {
    await placeCourse(onboarded, SECOND_COURSE);

    const second = await onboarded.context().newPage();
    try {
      await onboarded.goto('/en/learn/de');
      await second.goto('/en/learn/fr');

      await expect(second.getByRole('heading', { name: 'French' })).toBeVisible();
      await expect(second.getByRole('combobox', { name: 'Course' })).toHaveValue('fr');

      // The first tab is untouched by the second opening a different course.
      await onboarded.reload();
      await expect(onboarded.getByRole('heading', { name: 'German' })).toBeVisible();
      await expect(onboarded.getByRole('combobox', { name: 'Course' })).toHaveValue('de');
    } finally {
      await second.close();
    }
  });

  test('the switcher moves between courses', async ({ onboarded }) => {
    await placeCourse(onboarded, SECOND_COURSE);
    await onboarded.goto('/en/learn/de');

    await onboarded.getByRole('combobox', { name: 'Course' }).selectOption('fr');

    await expect(onboarded).toHaveURL(/\/learn\/fr$/);
    await expect(onboarded.getByRole('heading', { name: 'French' })).toBeVisible();
  });
});
