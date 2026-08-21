import { expect, test, type Browser } from '@playwright/test';

import { formatViolations, settle, watchConsole } from '../support/console-guard';
import { createSharedSession, type SharedSession, type SignedIn } from '../support/session';

test.describe('dashboard access and navigation', () => {
  // Every test below that needs to be signed in shares this one account
  // instead of signing up again: this file otherwise racks up ~20 signups (one
  // per tile/stub/route, each hashing a password with argon2), which under
  // parallel workers was slow enough to trip other tests' requests.
  let session: SharedSession;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    session = await createSharedSession(browser);
  });

  const signedInPage = (browser: Browser): Promise<SignedIn> => session.signedInPage(browser);

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
  // hand-written, so a 7th mode only needs a new row here. Each test reuses
  // the shared signed-in account, opens the dashboard, clicks the tile by its
  // accessible name, and checks the resulting URL. `exact: true` on the role
  // query matters because "Chat" is a literal prefix of "Chat progress".
  for (const [title, href] of tiles) {
    test(`clicking the ${title} tile navigates to ${href}`, async ({ browser }) => {
      const { page, context } = await signedInPage(browser);

      await page.goto('/dashboard');
      await page.getByRole('link', { name: title, exact: true }).click();

      await expect(page).toHaveURL(new RegExp(`${href}$`));
      await context.close();
    });
  }

  // The (mode) layout wraps every mode page with a back link and the same
  // account nav as the rest of the app. One page (/chat) stands in for all of
  // them: the layout is shared, so this is not per-page behaviour.
  test('the back link on a mode page returns to the dashboard', async ({ browser }) => {
    const { page, context } = await signedInPage(browser);

    await page.goto('/chat');
    await page.getByRole('link', { name: 'Back to dashboard' }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await context.close();
  });

  // Same layout-sharing argument as the back-link test above: SessionNav is
  // reused from the (main) layout, and auth.spec.ts already proves it there.
  // This only checks it also renders correctly inside the (mode) layout.
  test('the account nav on a mode page shows the signed-in user', async ({ browser }) => {
    const { page, context } = await signedInPage(browser);

    await page.goto('/chat');
    await expect(page.getByRole('navigation', { name: 'Account' })).toContainText(
      session.displayName,
    );
    await context.close();
  });

  // Stub pages behind the lobby tiles that have no dedicated feature yet:
  // every tile except Chat, which has a real page. Asserting the title keeps
  // this from silently matching the wrong page if a future page reuses the
  // same ComingSoon copy.
  const stubs = tiles.filter(([title]) => title !== 'Chat');

  // One test per stub route: reuse the shared signed-in account, open the
  // route directly (not via the tile click, since that is already covered
  // above), and check the ComingSoon component rendered with the right title
  // plus its fixed body copy. Confirms the page isn't blank or throwing, not
  // just that it exists.
  for (const [title, href] of stubs) {
    test(`${href} shows the coming-soon placeholder for ${title}`, async ({ browser }) => {
      const { page, context } = await signedInPage(browser);

      await page.goto(href);
      await expect(page.getByText(title, { exact: true })).toBeVisible();
      await expect(page.getByText('This mode is still in development.')).toBeVisible();
      await context.close();
    });
  }

  // These routes were dropped from PAGE_ROUTES in routes.ts once they started
  // requiring a session: an anonymous goto would just land on /login and test
  // that page instead. Reused here, signed in via the shared account, so the
  // console gate still covers them.
  const consoleGatedRoutes = ['/dashboard', '/chat', ...stubs.map(([, href]) => href)];

  // Same assertion style as console.spec.ts: attach the listener before
  // goto so load-time messages aren't missed, wait for the network to go
  // quiet so async errors have had time to surface, then require zero
  // console errors/warnings/uncaught exceptions/failed requests.
  for (const route of consoleGatedRoutes) {
    test(`${route} logs nothing in the browser console when signed in`, async ({ browser }) => {
      const { page, context } = await signedInPage(browser);

      const violations = watchConsole(page);
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await settle(page);

      expect(
        violations,
        `${route} produced browser console output:\n${formatViolations(violations)}\n`,
      ).toEqual([]);
      await context.close();
    });
  }
});
