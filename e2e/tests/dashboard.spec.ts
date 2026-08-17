import { expect, test, type Page } from '@playwright/test';

import { formatViolations, settle, watchConsole } from '../support/console-guard';

test.describe('dashboard access and navigation', () => {
  const password = 'Correct-Horse-9';

  // A timestamp plus a small random suffix collides often enough across this
  // many parallel tests to fail signup on a reused email. A UUID does not.
  // displayName is capped at 32 characters, so only the first UUID segment is
  // used there; the full UUID is fine in the email local part.
  const identity = () => {
    const stamp = crypto.randomUUID();
    return { email: `browser-${stamp}@example.com`, displayName: `browser${stamp.split('-')[0]}` };
  };

  // Fills the signup form and waits for the redirect to /profile, which only
  // happens once the account exists and the session cookie is set. Every test
  // below that needs to be signed in calls this first, because /dashboard and
  // every mode page require a session.
  const createAccount = async (page: Page, fields: ReturnType<typeof identity>) => {
    await page.goto('/signup');
    await page.getByLabel('Email', { exact: true }).fill(fields.email);
    await page.getByLabel('Display name', { exact: true }).fill(fields.displayName);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/profile$/);
  };

  // The dashboard page calls requireUser(), so an anonymous visit must bounce
  // to /login rather than render the lobby. Proves the guard actually works,
  // not just that it is written.
  test('a signed out visitor is sent to the login page', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });

  // Mirrors the `modes` array in dashboard/page.tsx: each lobby tile's visible
  // title paired with the route it should link to.
  const tiles: [string, string][] = [
    ['Discuss with a friend', '/friends'],
    ['Chat', '/chat'],
    ['Chat progress', '/chat-progress'],
    ['Word mode', '/word-mode'],
    ['Sentence mode', '/sentence-mode'],
    ['Roleplay', '/roleplay'],
  ];

  // One test per tile, generated from the table above rather than
  // hand-written, so a 7th mode only needs a new row here. Each test signs in
  // fresh, opens the dashboard, clicks the tile by its accessible name, and
  // checks the resulting URL. `exact: true` on the role query matters because
  // "Chat" is a literal prefix of "Chat progress".
  for (const [title, href] of tiles) {
    test(`clicking the ${title} tile navigates to ${href}`, async ({ page }) => {
      await createAccount(page, identity());

      await page.goto('/dashboard');
      await page.getByRole('link', { name: title, exact: true }).click();

      await expect(page).toHaveURL(new RegExp(`${href}$`));
    });
  }

  // The (mode) layout wraps every mode page with a back link and the same
  // account nav as the rest of the app. One page (/chat) stands in for all of
  // them: the layout is shared, so this is not per-page behaviour.
  test('the back link on a mode page returns to the dashboard', async ({ page }) => {
    const { email, displayName } = identity();
    await createAccount(page, { email, displayName });

    await page.goto('/chat');
    await page.getByRole('link', { name: 'Back to dashboard' }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
  });

  // Same layout-sharing argument as the back-link test above: SessionNav is
  // reused from the (main) layout, and auth.spec.ts already proves it there.
  // This only checks it also renders correctly inside the (mode) layout.
  test('the account nav on a mode page shows the signed-in user', async ({ page }) => {
    const { email, displayName } = identity();
    await createAccount(page, { email, displayName });

    await page.goto('/chat');
    await expect(page.getByRole('navigation', { name: 'Account' })).toContainText(displayName);
  });

  // Stub pages behind the lobby tiles that have no dedicated feature yet:
  // every tile except Chat, which has a real page. Asserting the title keeps
  // this from silently matching the wrong page if a future page reuses the
  // same ComingSoon copy.
  const stubs = tiles.filter(([title]) => title !== 'Chat');

  // One test per stub route: sign in, open the route directly (not via the
  // tile click, since that is already covered above), and check the
  // ComingSoon component rendered with the right title plus its fixed body
  // copy. Confirms the page isn't blank or throwing, not just that it exists.
  for (const [title, href] of stubs) {
    test(`${href} shows the coming-soon placeholder for ${title}`, async ({ page }) => {
      await createAccount(page, identity());

      await page.goto(href);
      await expect(page.getByText(title, { exact: true })).toBeVisible();
      await expect(page.getByText('This mode is still in development.')).toBeVisible();
    });
  }

  // These routes were dropped from PAGE_ROUTES in routes.ts once they started
  // requiring a session: an anonymous goto would just land on /login and test
  // that page instead. Re-created here, signed in, so the console gate still
  // covers them.
  const consoleGatedRoutes = ['/dashboard', '/chat', ...stubs.map(([, href]) => href)];

  // Same assertion style as console.spec.ts: attach the listener before
  // goto so load-time messages aren't missed, wait for the network to go
  // quiet so async errors have had time to surface, then require zero
  // console errors/warnings/uncaught exceptions/failed requests.
  for (const route of consoleGatedRoutes) {
    test(`${route} logs nothing in the browser console when signed in`, async ({ page }) => {
      await createAccount(page, identity());

      const violations = watchConsole(page);
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await settle(page);

      expect(
        violations,
        `${route} produced browser console output:\n${formatViolations(violations)}\n`,
      ).toEqual([]);
    });
  }
});
