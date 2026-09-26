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

  // Placing French makes it activeLang, so only the cookie can pick German.
  test('/dashboard sends an onboarded learner to the course they last opened', async ({
    onboarded,
  }) => {
    await placeCourse(onboarded, SECOND_COURSE);
    await onboarded.goto(home);
    await onboarded.goto('/en/dashboard');

    await expect(onboarded).toHaveURL(new RegExp(`${home}$`));
  });

  // Mirrors `modes` in components/practice-row.tsx: each link's visible title
  // on the course home paired with the route it should open. English values,
  // since this suite is pinned to /en.
  const practice: [string, string][] = [
    ['Tutor', '/en/chat'],
    ['Cross-language chat', '/en/friends'],
  ];

  // One test per link, generated from the table above, so a new mode only needs
  // a row here. `exact: true` keeps a longer title from matching a shorter one.
  for (const [title, href] of practice) {
    test(`the ${title} link on the course home navigates to ${href}`, async ({ onboarded }) => {
      await onboarded.goto(home);
      await onboarded.getByRole('link', { name: title, exact: true }).click();

      await expect(onboarded).toHaveURL(new RegExp(`${href}$`));
    });
  }

  // The (mode) layout wraps every mode page with a back link and the same
  // account nav as the rest of the app. One page (/chat) stands in for all of
  // them: the layout is shared, so this is not per-page behaviour. French is
  // placed last but German opened, so the link has to find its way back to German.
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

  // Stub pages behind the practice links that have no dedicated feature yet:
  // every one except Chat, which has a real page. Asserting the title keeps
  // this from silently matching the wrong page if a future page reuses the
  // same ComingSoon copy.
  const stubs = practice.filter(([, href]) => href !== '/en/chat');

  for (const [title, href] of stubs) {
    test(`${href} shows the coming-soon placeholder for ${title}`, async ({ signedIn }) => {
      await signedIn.goto(href);
      await expect(signedIn.getByText(title, { exact: true })).toBeVisible();
      await expect(signedIn.getByText('This mode is still in development.')).toBeVisible();
    });
  }

  // Their console gate is in console.spec.ts, driven by `onboarded` in routes.ts.
});
