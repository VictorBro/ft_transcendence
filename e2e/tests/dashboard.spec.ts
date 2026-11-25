import { expect, ONBOARDED_COURSE, placeCourse, SECOND_COURSE, test } from '../support/session';

const home = `/en/learn/${ONBOARDED_COURSE.lang}`;

test.describe('dashboard pages', () => {
  // /dashboard sends everyone to /learn, which calls requireCourses(), so an
  // anonymous visit must still end on /login rather than render anything.
  test('a signed out visitor is sent to the login page', async ({ page }) => {
    await page.goto('/en/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });

  // The lobby is gone, but old links and bookmarks still point at it.
  test('/dashboard sends a learner with no course to onboarding', async ({ signedIn }) => {
    await signedIn.goto('/en/dashboard');

    await expect(signedIn).toHaveURL(/\/en\/onboarding$/);
    await expect(
      signedIn.getByRole('heading', { name: 'What do you want to learn?' }),
    ).toBeVisible();
  });

  // Placing German makes it activeLang, so only the cookie can pick French.
  test('/dashboard sends an onboarded learner to the course they last opened', async ({
    onboarded,
  }) => {
    await placeCourse(onboarded, SECOND_COURSE);
    await onboarded.goto(home);
    await onboarded.goto('/en/dashboard');

    await expect(onboarded).toHaveURL(new RegExp(`${home}$`));
  });

  // The course home has no Practice links any more (#86).
  test('the course home has no Practice section', async ({ onboarded }) => {
    await onboarded.goto(home);
    await expect(onboarded.getByRole('heading', { name: 'French' })).toBeVisible();

    await expect(onboarded.getByText('Practice', { exact: true })).toHaveCount(0);
  });

  // /learn rather than the course itself: from the course home it is the same
  // page, and the layout cannot know which course is open anyway.
  test('the wordmark in the course shell links to /learn', async ({ onboarded }) => {
    await onboarded.goto(home);

    await expect(
      onboarded.getByRole('link', { name: 'ft_transcendence', exact: true }),
    ).toHaveAttribute('href', '/en/learn');
  });

  // The account shell must not throw a signed-in user out to the marketing
  // page (#224); a visitor still goes there.
  for (const path of [
    '/en',
    '/en/profile',
    '/en/friends',
    '/en/settings',
    '/en/privacy',
    '/en/terms',
  ]) {
    test(`the wordmark on ${path} links to /learn when signed in`, async ({ onboarded }) => {
      await onboarded.goto(path);

      await expect(
        onboarded.getByRole('link', { name: 'ft_transcendence', exact: true }),
      ).toHaveAttribute('href', '/en/learn');
    });
  }

  test('the wordmark links to the start page for a visitor', async ({ page }) => {
    await page.goto('/en/privacy');

    await expect(page.getByRole('link', { name: 'ft_transcendence', exact: true })).toHaveAttribute(
      'href',
      '/en',
    );
  });

  // Their console gate is in console.spec.ts, driven by `onboarded` in routes.ts.
});
