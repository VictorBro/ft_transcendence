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

  // Measure a request row with the longest name here.
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
 * The same pair as above, ending with no friendship again. Recently active is
 * shared by every worker on the stack, so only the learner is asserted there:
 * it opened its socket just before the visitor's page rendered, which keeps it
 * in the top 20 (on CI two workers share a stack; locally, twenty other
 * connects in that second are not a realistic worry). The list also shows other
 * workers' avatars, so one that avatar.spec.ts removes at that moment can fail
 * this run with a 404: rare, and known.
 */
test('a stranger found among the recently active is added from their profile, then visited as a friend', async ({
  onboarded: learner,
  signedIn: visitor,
  account,
  onboardedAccount,
}) => {
  const violations = [watchConsole(learner), watchConsole(visitor)];
  // One after the other: the learner's handshake stamps it before the visitor's list renders.
  const learnerLive = liveConnection(learner);
  await learner.goto('/en/friends');
  await learnerLive;
  const visitorLive = liveConnection(visitor);
  await visitor.goto('/en/friends');
  await visitorLive;

  const recent = row(region(visitor, 'Recently active'), onboardedAccount.displayName);
  await expect(recent).toContainText('French');
  // Scoped to the row: the name could also be a search result or a nav link.
  await recent.getByRole('link', { name: onboardedAccount.displayName }).click();

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
  expect(violations.flat(), `the pages logged:\n${formatViolations(violations.flat())}\n`).toEqual(
    [],
  );
});
