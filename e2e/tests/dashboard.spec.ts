import { formatViolations, settle, watchConsole } from '../support/console-guard';
import { expect, test } from '../support/session';

test.describe('dashboard access and navigation', () => {
  // The dashboard page calls requireUser(), so an anonymous visit must bounce
  // to /login rather than render the lobby. Proves the guard actually works,
  // not just that it is written.
  test('a signed out visitor is sent to the login page', async ({ page }) => {
    await page.goto('/en/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });

  // Mirrors the `modes` array in dashboard/page.tsx: each lobby tile's visible
  // title paired with the route it should link to. The titles live in the Lobby
  // namespace now, so these are the English values the catalogue holds — this
  // suite is pinned to /en.
  const tiles: [string, string][] = [
    ['Discuss with a friend', '/en/friends'],
    ['Chat', '/en/chat'],
    ['Chat progress', '/en/chat-progress'],
    ['Word mode', '/en/word-mode'],
    ['Sentence mode', '/en/sentence-mode'],
    ['Roleplay', '/en/roleplay'],
  ];

  // One test per tile, generated from the table above rather than
  // hand-written, so a 7th mode only needs a new row here. `exact: true` on the
  // role query matters because "Chat" is a literal prefix of "Chat progress".
  for (const [title, href] of tiles) {
    test(`clicking the ${title} tile navigates to ${href}`, async ({ signedIn }) => {
      await signedIn.goto('/en/dashboard');
      await signedIn.getByRole('link', { name: title, exact: true }).click();

      await expect(signedIn).toHaveURL(new RegExp(`${href}$`));
    });
  }

  // The (mode) layout wraps every mode page with a back link and the same
  // account nav as the rest of the app. One page (/chat) stands in for all of
  // them: the layout is shared, so this is not per-page behaviour.
  test('the back link on a mode page returns to the dashboard', async ({ signedIn }) => {
    await signedIn.goto('/en/chat');
    await signedIn.getByRole('link', { name: 'Back to dashboard' }).click();

    await expect(signedIn).toHaveURL(/\/dashboard$/);
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

  // Stub pages behind the lobby tiles that have no dedicated feature yet:
  // every tile except Chat, which has a real page. Asserting the title keeps
  // this from silently matching the wrong page if a future page reuses the
  // same ComingSoon copy.
  const stubs = tiles.filter(([title]) => title !== 'Chat');

  for (const [title, href] of stubs) {
    test(`${href} shows the coming-soon placeholder for ${title}`, async ({ signedIn }) => {
      await signedIn.goto(href);
      await expect(signedIn.getByText(title, { exact: true })).toBeVisible();
      await expect(signedIn.getByText('This mode is still in development.')).toBeVisible();
    });
  }

  // These routes were dropped from PAGE_ROUTES in routes.ts once they started
  // requiring a session: an anonymous goto would just land on /login and test
  // that page instead. Reused here, signed in, so the console gate still
  // covers them.
  const consoleGatedRoutes = ['/en/dashboard', '/en/chat', ...stubs.map(([, href]) => href)];

  // Same assertion style as console.spec.ts: attach the listener before
  // goto so load-time messages aren't missed, wait for the network to go
  // quiet so async errors have had time to surface, then require zero
  // console errors/warnings/uncaught exceptions/failed requests.
  for (const route of consoleGatedRoutes) {
    test(`${route} logs nothing in the browser console when signed in`, async ({ signedIn }) => {
      const violations = watchConsole(signedIn);
      await signedIn.goto(route, { waitUntil: 'domcontentloaded' });
      await settle(signedIn);

      expect(
        violations,
        `${route} produced browser console output:\n${formatViolations(violations)}\n`,
      ).toEqual([]);
    });
  }
});
