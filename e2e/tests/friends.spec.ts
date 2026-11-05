import type { Locator, Page } from '@playwright/test';

import { formatViolations, settle, watchConsole } from '../support/console-guard';
import { expectFitsTheScreen } from '../support/layout';
import { liveConnection } from '../support/live';
import { expect, test } from '../support/session';

const region = (page: Page, name: string) => page.getByRole('region', { name });
const row = (scope: Locator, name: string) => scope.getByRole('listitem').filter({ hasText: name });

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

  // No reload on this side: the request arrives over the socket.
  const received = row(region(friend, 'Requests received'), onboardedAccount.displayName);
  await expect(received).toBeVisible();

  // The layout gate only sees empty lists: measure a row with the longest name here.
  await friend.setViewportSize({ width: 360, height: 800 });
  await expectFitsTheScreen(friend, '/en/friends');

  await received.getByRole('button', { name: 'Accept' }).click();

  await expect(region(friend, 'Your friends')).toContainText(onboardedAccount.displayName);
  await expect(region(asker, 'Your friends')).toContainText(account.displayName);

  await row(region(asker, 'Your friends'), account.displayName)
    .getByRole('button', { name: 'Remove' })
    .click();
  await asker
    .getByRole('dialog', { name: `Remove ${account.displayName} from your friends?` })
    .getByRole('button', { name: 'Remove' })
    .click();
  await expect(region(asker, 'Your friends')).not.toContainText(account.displayName);
  await expect(region(friend, 'Your friends')).not.toContainText(onboardedAccount.displayName);

  await Promise.all([settle(asker), settle(friend)]);
  expect(violations.flat(), `the pages logged:\n${formatViolations(violations.flat())}\n`).toEqual(
    [],
  );
});
