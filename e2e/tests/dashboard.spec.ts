import { expect, ONBOARDED_COURSE, placeCourse, SECOND_COURSE, test } from '../support/session';

const home = `/en/learn/${ONBOARDED_COURSE.lang}`;

test.describe('dashboard and mode pages', () => {
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

  // The course home has no Practice links any more (#86). The tutor page stays
  // at /chat, and Friends lives in the account menu since #155.
  const modes: [string, string][] = [['Tutor', '/en/chat']];

  test('the course home has no Practice section', async ({ onboarded }) => {
    await onboarded.goto(home);
    await expect(onboarded.getByRole('heading', { name: 'French' })).toBeVisible();

    for (const [title] of modes) {
      await expect(onboarded.getByRole('link', { name: title, exact: true })).toHaveCount(0);
    }
    await expect(onboarded.getByText('Practice', { exact: true })).toHaveCount(0);
  });

  // The (mode) layout wraps every mode page with a back link and the same
  // account nav as the rest of the app. One page (/chat) stands in for all of
  // them: the layout is shared, so this is not per-page behaviour. German is
  // placed last but French opened, so the link has to find its way back to French.
  test('the back link on a mode page returns to the course', async ({ onboarded }) => {
    await placeCourse(onboarded, SECOND_COURSE);
    await onboarded.goto(home);
    await onboarded.goto('/en/chat');
    await onboarded.getByRole('link', { name: 'Back to course' }).click();

    await expect(onboarded).toHaveURL(new RegExp(`${home}$`));
  });

  // /learn rather than the course itself: from the course home it is the same
  // page, and the layout cannot know which course is open anyway.
  test('the wordmark in the course shell links to /learn', async ({ onboarded }) => {
    await onboarded.goto(home);

    await expect(
      onboarded.getByRole('link', { name: 'ft_transcendence', exact: true }),
    ).toHaveAttribute('href', '/en/learn');
  });

  // Same layout-sharing argument as the back-link test above: SessionNav is
  // reused from the (main) layout, and auth.spec.ts already proves it there.
  // This only checks it also renders correctly inside the (mode) layout.
  test('the account nav on a mode page shows the signed-in user', async ({ signedIn, account }) => {
    await signedIn.goto('/en/chat');
    await expect(signedIn.getByRole('navigation', { name: 'Account' })).toContainText(
      account.displayName,
    );
  });

  // Their console gate is in console.spec.ts, driven by `onboarded` in routes.ts.
});
