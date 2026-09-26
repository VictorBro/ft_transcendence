import {
  enrol,
  expect,
  ONBOARDED_COURSE,
  placeCourse,
  SECOND_COURSE,
  test,
} from '../support/session';

/**
 * Where a signed-in learner lands. Login and the home page both go to /learn,
 * which only picks the page, so these visit it directly instead of logging in:
 * POST /auth/login allows 5 a minute per address and every test shares one.
 * auth.spec.ts proves both login steps go through it.
 */
test.describe('post-auth landing', () => {
  test('a signed out visitor is sent to the login page', async ({ page }) => {
    await page.goto('/en/learn');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('a learner with no course lands on onboarding', async ({ signedIn }) => {
    await signedIn.goto('/en/learn');

    await expect(signedIn).toHaveURL(/\/en\/onboarding$/);
    await expect(
      signedIn.getByRole('heading', { name: 'What do you want to learn?' }),
    ).toBeVisible();
  });

  // French is written last, so activeLang says French: only the cookie can
  // send the learner to German.
  test('with two courses, the one this browser last opened wins', async ({ onboarded }) => {
    await placeCourse(onboarded, SECOND_COURSE);
    await onboarded.goto(`/en/learn/${ONBOARDED_COURSE.lang}`);

    await onboarded.goto('/en/learn');

    await expect(onboarded).toHaveURL(new RegExp(`/en/learn/${ONBOARDED_COURSE.lang}$`));
  });

  // A fresh context has no cookie, as on a second device. German is the first
  // course, so landing on French proves activeLang decided rather than order.
  test('with two courses and no cookie, the course last written to wins', async ({ onboarded }) => {
    await placeCourse(onboarded, SECOND_COURSE);

    await onboarded.goto('/en/learn');
    await expect(onboarded).toHaveURL(/\/en\/learn\/fr$/);
  });

  // The course home would only redirect again, so /learn goes straight there.
  test('a course with no level lands on its level step', async ({ freshLearner }) => {
    await enrol(freshLearner, 'fr', 10);

    await freshLearner.goto('/en/learn');

    await expect(freshLearner).toHaveURL(/\/en\/onboarding\?lang=fr$/);
    await expect(freshLearner.getByRole('heading', { name: 'Français' })).toBeVisible();
  });

  test('the home page offers a signed out visitor a way to start', async ({ page }) => {
    await page.goto('/en');
    await expect(page.getByRole('link', { name: 'Start now' })).toHaveAttribute(
      'href',
      '/en/signup',
    );
  });

  test('the home page takes a signed-in learner back to their course', async ({ onboarded }) => {
    await onboarded.goto(`/en/learn/${ONBOARDED_COURSE.lang}`);
    await onboarded.goto('/en');
    await onboarded.getByRole('link', { name: 'Continue learning' }).click();

    await expect(onboarded).toHaveURL(new RegExp(`/en/learn/${ONBOARDED_COURSE.lang}$`));
  });
});
