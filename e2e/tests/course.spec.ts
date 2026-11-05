import {
  courseLevel,
  enrol,
  expect,
  ONBOARDED_COURSE,
  pickLevel,
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

    await expect(onboarded.getByRole('heading', { name: 'French' })).toBeVisible();
    await expect(onboarded.getByRole('combobox', { name: 'Level' })).toHaveValue(
      ONBOARDED_COURSE.level,
    );
    await expect(onboarded.getByRole('link', { name: 'Take the placement test' })).toBeVisible();

    await expect(onboarded.getByRole('combobox', { name: 'Daily goal' })).toHaveValue(
      String(ONBOARDED_COURSE.dailyGoal),
    );
    await expect(onboarded.getByRole('combobox', { name: 'Course' })).toHaveValue(
      ONBOARDED_COURSE.lang,
    );
  });

  /**
   * Surviving a new visit is what separates a PATCH from a select that just
   * moved: the select shows the pick at once, before the save. The visit is in
   * a second tab, since a reload during the save's router.refresh() is aborted
   * by Firefox (NS_BINDING_ABORTED, #176).
   */
  test('changing the daily goal persists', async ({ onboarded }) => {
    await placeCourse(onboarded, SECOND_COURSE);
    await onboarded.goto(`/en/learn/${SECOND_COURSE.lang}`);

    await onboarded.getByRole('combobox', { name: 'Daily goal' }).selectOption('60');
    await expect(onboarded.getByRole('combobox', { name: 'Daily goal' })).toHaveValue('60');
    await expect
      .poll(async () => {
        const { courses } = await (await onboarded.request.get('/api/courses')).json();
        return courses.find((course: { lang: string }) => course.lang === SECOND_COURSE.lang)
          .dailyGoal;
      })
      .toBe(60);

    const next = await onboarded.context().newPage();
    try {
      await next.goto(`/en/learn/${SECOND_COURSE.lang}`);
      await expect(next.getByRole('combobox', { name: 'Daily goal' })).toHaveValue('60');
    } finally {
      await next.close();
    }
  });

  /**
   * No exam needed: the level is a course setting next to the goal. It saves
   * with a button, since every arrow key on a closed select fires `change`.
   * SECOND_COURSE, since every test that uses it places it anew.
   */
  test('the level can be changed from the course page', async ({ onboarded }) => {
    await placeCourse(onboarded, SECOND_COURSE);
    await onboarded.goto(`/en/learn/${SECOND_COURSE.lang}`);
    const level = onboarded.getByRole('combobox', { name: 'Level' });
    const save = onboarded.getByRole('button', { name: 'Save' });

    await expect(level).toHaveValue(SECOND_COURSE.level);
    await expect(onboarded.getByRole('button', { name: 'Change level' })).toHaveCount(0);
    await expect(save).toHaveCount(0);

    // Browsing with the keyboard writes nothing and keeps the focus.
    await level.focus();
    await onboarded.keyboard.press('ArrowDown');
    await onboarded.keyboard.press('ArrowDown');
    await expect(level).toHaveValue('B1');
    await expect(level).toBeFocused();
    expect(await courseLevel(onboarded, SECOND_COURSE.lang)).toBe(SECOND_COURSE.level);

    await pickLevel(onboarded, 'B2');
    await save.click();
    await expect(
      onboarded.getByRole('status').filter({ hasText: 'Level saved: B2' }),
    ).toBeAttached();
    expect(await courseLevel(onboarded, SECOND_COURSE.lang)).toBe('B2');
    await expect(save).toHaveCount(0);

    // The next visit in a second tab rather than a reload: the save ends in
    // router.refresh(), and leaving the page while its stream and the
    // prefetches it restarts are still open makes Firefox abort the
    // navigation (NS_BINDING_ABORTED), as in #176.
    const next = await onboarded.context().newPage();
    try {
      await next.goto(`/en/learn/${SECOND_COURSE.lang}`);
      await expect(next.getByRole('combobox', { name: 'Level' })).toHaveValue('B2');
    } finally {
      await next.close();
    }
  });

  /** Faked, since no level a learner can pick gets refused. The pick stays, to retry. */
  test('a level change the server refuses says why and saves nothing', async ({ onboarded }) => {
    await placeCourse(onboarded, SECOND_COURSE);
    let attempts = 0;
    await onboarded.route(`**/api/courses/${SECOND_COURSE.lang}/level`, (route) => {
      attempts += 1;
      return route.fulfill({ status: 500, json: {} });
    });
    await onboarded.goto(`/en/learn/${SECOND_COURSE.lang}`);

    await pickLevel(onboarded, 'B1');
    await onboarded.getByRole('button', { name: 'Save' }).click();

    await expect(onboarded.getByText('The server answered HTTP 500')).toBeVisible();
    await expect(onboarded.getByRole('combobox', { name: 'Level' })).toHaveValue('B1');
    await expect(onboarded.getByRole('button', { name: 'Save' })).toBeVisible();
    expect(attempts).toBe(1);
    expect(await courseLevel(onboarded, SECOND_COURSE.lang)).toBe(SECOND_COURSE.level);
  });

  // The cookie is how /learn knows which course to send the learner back to.
  test('opening a course records it for next time', async ({ onboarded }) => {
    await placeCourse(onboarded, SECOND_COURSE);

    const cookie = async () =>
      (await onboarded.context().cookies()).find((c) => c.name === 'ft.lang');

    await onboarded.goto('/en/learn/fr');
    expect((await cookie())?.value).toBe('fr');

    await onboarded.goto('/en/learn/de');
    expect((await cookie())?.value).toBe('de');

    // Next prefetches the links on a course page. Those sit under /learn/<lang>
    // too, and a link the learner only saw must not count as opening it.
    await onboarded.request.get('/en/learn/fr/placement');
    expect((await cookie())?.value).toBe('de');

    // Not a course page, so it must leave the last one alone rather than clear it.
    await onboarded.goto('/en/profile');
    expect((await cookie())?.value).toBe('de');
    // Only the server reads it.
    expect((await cookie())?.httpOnly).toBe(true);
  });

  // Every page reads its course from the URL, so two tabs share no state worth
  // fighting over. Same context, so they share cookies and the session.
  test('two tabs can sit on two different courses', async ({ onboarded }) => {
    await placeCourse(onboarded, SECOND_COURSE);

    const second = await onboarded.context().newPage();
    try {
      await onboarded.goto('/en/learn/fr');
      await second.goto('/en/learn/de');

      await expect(second.getByRole('heading', { name: 'German' })).toBeVisible();
      await expect(second.getByRole('combobox', { name: 'Course' })).toHaveValue('de');

      // The first tab is untouched by the second opening a different course.
      await onboarded.reload();
      await expect(onboarded.getByRole('heading', { name: 'French' })).toBeVisible();
      await expect(onboarded.getByRole('combobox', { name: 'Course' })).toHaveValue('fr');
    } finally {
      await second.close();
    }
  });

  test('the switcher moves between courses', async ({ onboarded }) => {
    await placeCourse(onboarded, SECOND_COURSE);
    await onboarded.goto('/en/learn/fr');

    await onboarded.getByRole('combobox', { name: 'Course' }).selectOption('de');

    await expect(onboarded).toHaveURL(/\/learn\/de$/);
    await expect(onboarded.getByRole('heading', { name: 'German' })).toBeVisible();
  });
});
