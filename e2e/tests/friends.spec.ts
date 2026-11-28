import type { Locator, Page } from '@playwright/test';

import {
  type ConsoleViolation,
  formatViolations,
  isRemovedAvatar,
  settle,
  watchConsole,
} from '../support/console-guard';
import { expectFitsTheScreen } from '../support/layout';
import { liveConnection } from '../support/live';
import { openMenu } from '../support/menu';
import { expect, test } from '../support/session';

const region = (page: Page, name: string) => page.getByRole('region', { name });
const row = (scope: Locator, name: string) => scope.getByRole('listitem').filter({ hasText: name });
/** The account links fold behind this button, which carries the counts. */
const menuButton = (page: Page) => page.getByRole('button', { name: /^Menu/ });
/** The account menu's link, named with its count while there is one. */
const friendsLink = (page: Page) =>
  page.getByRole('navigation', { name: 'Account' }).getByRole('link', { name: /^Friends/ });

/** Neither account here has an avatar: see isRemovedAvatar. */
const ours = (violations: ConsoleViolation[][]) =>
  violations.flat().filter((violation) => !isRemovedAvatar(violation));

/**
 * Two people, two contexts: the worker's own accounts, so no signup. Ends by
 * removing the friendship, which leaves the pair as the next test in the worker
 * expects it; a failure replaces the worker and its accounts anyway.
 */
test('a request shows up live, is accepted, and both lists follow', async ({
  onboarded: asker,
  signedIn: friend,
  account,
  onboardedAccount,
}) => {
  const violations = [watchConsole(asker), watchConsole(friend)];
  // Armed before the visits: an event sent before a socket is in its room reaches nobody.
  const live = [liveConnection(asker), liveConnection(friend)];
  await Promise.all([asker.goto('/en/friends'), friend.goto('/en/friends')]);
  await Promise.all(live);

  await asker.getByRole('searchbox', { name: 'Search by display name' }).fill(account.displayName);
  await asker.getByRole('button', { name: 'Search', exact: true }).click();
  await row(asker.getByRole('list', { name: 'Search results' }), account.displayName)
    .getByRole('button', { name: 'Add friend' })
    .click();
  await expect(region(asker, 'Requests sent')).toContainText(account.displayName);

  // No reload on this side: the request arrives over the socket, and so does its count.
  const received = row(region(friend, 'Requests received'), onboardedAccount.displayName);
  await expect(received).toBeVisible();
  await expect(menuButton(friend)).toHaveAccessibleName('Menu 1 friend request');
  // A request sent is not one waiting on you.
  await expect(menuButton(asker)).toHaveAccessibleName('Menu');

  // The server renders the count too, so a fresh load has it before its socket.
  expect(await (await friend.request.get('/en/profile')).text()).toContain('1 friend request');

  // Another tab of the friend's, on a page with no RefreshOn: only the socket
  // can take its count down once the request is answered.
  const other = await friend.context().newPage();
  violations.push(watchConsole(other));
  const otherLive = liveConnection(other);
  await other.goto('/en/profile');
  await otherLive;
  await expect(menuButton(other)).toHaveAccessibleName('Menu 1 friend request');

  // Measure a request row with the longest name here, and the button with its count.
  await friend.setViewportSize({ width: 360, height: 800 });
  await expectFitsTheScreen(friend, '/en/friends');
  await openMenu(friend);
  await expect(friendsLink(friend)).toHaveAccessibleName('Friends 1 friend request');
  await expectFitsTheScreen(friend, '/en/friends (menu open)');
  await friend.keyboard.press('Escape');
  await expect(menuButton(friend)).toHaveAttribute('aria-expanded', 'false');

  await received.getByRole('button', { name: 'Accept' }).click();

  await expect(region(friend, 'Your friends')).toContainText(onboardedAccount.displayName);
  await expect(region(asker, 'Your friends')).toContainText(account.displayName);
  // Accepted: nothing waits any more, in either tab.
  await expect(menuButton(friend)).toHaveAccessibleName('Menu');
  await expect(menuButton(other)).toHaveAccessibleName('Menu');

  await row(region(asker, 'Your friends'), account.displayName)
    .getByRole('button', { name: 'Remove' })
    .click();
  await asker
    .getByRole('dialog', { name: `Remove ${account.displayName} from your friends?` })
    .getByRole('button', { name: 'Remove' })
    .click();
  await expect(region(asker, 'Your friends')).not.toContainText(account.displayName);
  await expect(region(friend, 'Your friends')).not.toContainText(onboardedAccount.displayName);

  await Promise.all([settle(asker), settle(friend), settle(other)]);
  expect(ours(violations), `the pages logged:\n${formatViolations(ours(violations))}\n`).toEqual(
    [],
  );
});

test('a profile needs a session', async ({ page }) => {
  await page.goto(`/en/users/${crypto.randomUUID()}`);
  await expect(page).toHaveURL(/\/login$/);
});

test('an unknown or malformed profile is a 404', async ({ onboarded }) => {
  for (const id of [crypto.randomUUID(), 'not-a-uuid']) {
    expect((await onboarded.goto(`/en/users/${id}`))?.status()).toBe(404);
  }
});

/**
 * The same pair as above, ending with no friendship again. Found by search, not
 * in Recently active: that list is shared by every worker on the stack, and the
 * API tests cover who is in it.
 */
test('a stranger found by search is added from their profile, then visited as a friend', async ({
  onboarded: learner,
  signedIn: visitor,
  account,
  onboardedAccount,
}) => {
  const violations = [watchConsole(learner), watchConsole(visitor)];
  const live = [liveConnection(learner), liveConnection(visitor)];
  await Promise.all([learner.goto('/en/friends'), visitor.goto('/en/friends')]);
  await Promise.all(live);

  await visitor
    .getByRole('searchbox', { name: 'Search by display name' })
    .fill(onboardedAccount.displayName);
  await visitor.getByRole('button', { name: 'Search', exact: true }).click();
  await row(visitor.getByRole('list', { name: 'Search results' }), onboardedAccount.displayName)
    .getByRole('link', { name: onboardedAccount.displayName })
    .click();

  await expect(visitor).toHaveURL(/\/en\/users\/[0-9a-f-]{36}$/);
  await expect(visitor.getByRole('heading', { level: 1 })).toHaveText(onboardedAccount.displayName);
  // No streak: other specs may move it.
  await expect(row(region(visitor, 'Courses'), 'French')).toContainText('A1');

  await visitor.getByRole('button', { name: 'Add friend' }).click();
  await expect(visitor.getByText('Request sent', { exact: true })).toBeVisible();
  await expect(visitor.getByRole('button', { name: 'Cancel request' })).toBeVisible();

  // The longest name in the heading, beside the widest action row.
  await visitor.setViewportSize({ width: 360, height: 800 });
  await expectFitsTheScreen(visitor, new URL(visitor.url()).pathname);

  await row(region(learner, 'Requests received'), account.displayName)
    .getByRole('button', { name: 'Accept' })
    .click();
  // No reload on the profile: the accept arrives over the socket.
  await expect(visitor.getByText('Already friends', { exact: true })).toBeVisible();
  await expect(visitor.getByRole('button', { name: 'Remove' })).toBeVisible();

  await row(region(learner, 'Your friends'), account.displayName)
    .getByRole('link', { name: account.displayName })
    .click();
  await expect(learner.getByRole('heading', { level: 1 })).toHaveText(account.displayName);
  await expect(region(learner, 'Courses')).toContainText('No courses yet.');

  await learner.getByRole('button', { name: 'Remove' }).click();
  await learner
    .getByRole('dialog', { name: `Remove ${account.displayName} from your friends?` })
    .getByRole('button', { name: 'Remove' })
    .click();
  await expect(learner.getByRole('button', { name: 'Add friend' })).toBeVisible();
  await expect(visitor.getByRole('button', { name: 'Add friend' })).toBeVisible();

  await Promise.all([settle(learner), settle(visitor)]);
  expect(ours(violations), `the pages logged:\n${formatViolations(ours(violations))}\n`).toEqual(
    [],
  );
});

/**
 * The API's PRESENCE_GRACE_MS (apps/api/src/presence/presence.service.ts),
 * copied since e2e cannot import the API: how long a closed tab may take to
 * come back. Change both together.
 */
const PRESENCE_GRACE_MS = 10_000;

/**
 * The issue's done-when: two people, two contexts. Closing the friend's only
 * tab turns their dot grey on the other side once the grace period is over,
 * and opening it again turns it green, with no reload on the watching side.
 */
test("a friend's dot goes grey when they leave and green when they come back", async ({
  onboarded: watcher,
  signedIn: friend,
  // Only for the friendship it brings.
  ids: _ids,
  account,
}) => {
  // The grace period alone is a third of the default 30 s.
  test.setTimeout(60_000);
  const live = [liveConnection(watcher), liveConnection(friend)];
  await Promise.all([watcher.goto('/en/friends'), friend.goto('/en/friends')]);
  await Promise.all(live);

  // The dot is the row's only image: the avatar is hidden from screen readers.
  const dot = row(region(watcher, 'Your friends'), account.displayName).getByRole('img');
  await expect(dot).toHaveAccessibleName('Online');

  // The friend's only tab, and with it their only socket.
  const context = friend.context();
  await friend.close();
  await expect(dot).toHaveAccessibleName('Offline', { timeout: PRESENCE_GRACE_MS + 10_000 });

  await (await context.newPage()).goto('/en/friends');
  await expect(dot).toHaveAccessibleName('Online');
});
