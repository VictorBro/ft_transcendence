import type { Locator, Page, WebSocketRoute } from '@playwright/test';
import { MESSAGE_MAX_LENGTH, type Conversations } from '@ft/shared';

import {
  type ConsoleViolation,
  formatViolations,
  isRemovedAvatar,
  settle,
  watchConsole,
} from '../support/console-guard';
import { expectFitsTheScreen, expectPinned } from '../support/layout';
import { liveConnection } from '../support/live';
import {
  expect,
  idOf,
  ONBOARDED_COURSE,
  placeCourse,
  SECOND_COURSE,
  test,
} from '../support/session';
import { openMenu } from '../support/menu';

const PHONE = { width: 360, height: 800 };

/*
 * Every test here makes the worker's pair friends through `ids`. Their
 * conversation outlives the friendship, as it would for people, so every text
 * below is unique.
 */
const unique = (label: string) => `${label} ${crypto.randomUUID()}`;

/** The account menu's link, named with its count while there is one. */
const messagesLink = (page: Page, name = 'Messages', nav = 'Account') =>
  page.getByRole('navigation', { name: nav }).getByRole('link', { name });
/** The account links fold behind this button, which carries the count. */
const menuButton = (page: Page, name = 'Menu') =>
  page.getByRole('button', { name: new RegExp(`^${name}`) });
const thread = (page: Page, partner: string) => page.getByRole('log', { name: partner });
const item = (scope: Locator, text: string) =>
  scope.getByRole('listitem').filter({ hasText: text });
const box = (page: Page, name = 'Write a message') => page.getByRole('textbox', { name });

/** Sends with Enter. The box empties on the ack, once the message is stored. */
async function send(page: Page, text: string, boxName?: string): Promise<void> {
  await box(page, boxName).fill(text);
  await box(page, boxName).press('Enter');
  await expect(box(page, boxName)).toHaveValue('');
}

/**
 * What the API holds unread for this page's account. The pair only ever writes
 * to each other, so this is their conversation's. Read rather than the badge
 * where a badge showing nothing could also be a first paint, before any count.
 */
const unread = async (page: Page): Promise<number> => {
  const { conversations } = (await (
    await page.request.get('/api/conversations')
  ).json()) as Conversations;
  return conversations.reduce((sum, conversation) => sum + conversation.unread, 0);
};

/** Neither account has an avatar, and /friends lists other learners: see isRemovedAvatar. */
const ours = (violations: ConsoleViolation[][]) =>
  violations.flat().filter((violation) => !isRemovedAvatar(violation));

async function expectSilent(pages: Page[], violations: ConsoleViolation[][]): Promise<void> {
  await Promise.all(pages.map((page) => settle(page)));
  expect(ours(violations), `the pages logged:\n${formatViolations(ours(violations))}\n`).toEqual(
    [],
  );
}

/**
 * The issue's done-when, two people in two contexts: one writes, the other
 * hears it live, the badge counts it and opening the thread clears it, and the
 * history survives a reload.
 */
test('a message arrives live, is counted, is read by opening the thread, and stays', async ({
  onboarded: writer,
  signedIn: reader,
  ids,
  account,
  onboardedAccount,
}) => {
  const violations = [watchConsole(writer), watchConsole(reader)];
  // Armed before the visits: an event sent before a socket is in its room reaches nobody.
  const live = [liveConnection(writer), liveConnection(reader)];
  await Promise.all([writer.goto(`/en/chat?with=${ids.signedIn}`), reader.goto('/en/friends')]);
  await Promise.all(live);

  const first = unique('first');
  await send(writer, first);
  // Once: the dm:message to the writer's own room is how it joins the thread.
  await expect(item(thread(writer, account.displayName), first)).toHaveCount(1);

  // No reload on this side: the count arrives over the socket.
  await expect(menuButton(reader)).toHaveAccessibleName('Menu 1 unread message');

  // A fresh load with the message unread: the thread reads it once it is on screen.
  const reconnected = liveConnection(reader);
  await reader.goto(`/en/chat?with=${ids.onboarded}`);
  await reconnected;
  const readerThread = thread(reader, onboardedAccount.displayName);
  await expect(readerThread).toContainText(first);
  await expect.poll(() => unread(reader)).toBe(0);
  await expect(menuButton(reader)).toHaveAccessibleName('Menu');

  // Live both ways with the thread open on each side.
  const second = unique('second');
  await send(writer, second);
  await expect(item(readerThread, second)).toBeVisible();

  // Shift+Enter starts a new line in the same message; the button sends too.
  const reply = unique('reply');
  await box(reader).fill(reply);
  await box(reader).press('Shift+Enter');
  await box(reader).pressSequentially('second line');
  await reader.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(box(reader)).toHaveValue('');
  await expect(item(thread(writer, account.displayName), reply)).toContainText('second line');

  await reader.reload();
  await expect(readerThread.getByRole('listitem')).toContainText([first, second, reply]);

  // Each side read the other's in the open thread, so the next test starts with none.
  await expect.poll(() => unread(writer)).toBe(0);
  await expect.poll(() => unread(reader)).toBe(0);
  await expectSilent([writer, reader], violations);
});

/**
 * Where Message on /friends leads before the first message. A learner with no
 * conversation at all, so nothing but the open thread can put a row in the list.
 */
test('a friend written to for the first time is listed, as the open conversation', async ({
  freshLearner,
  signedIn,
  account,
}) => {
  const violations = [watchConsole(freshLearner)];
  const [freshId, friendId] = await Promise.all([idOf(freshLearner), idOf(signedIn)]);
  expect((await freshLearner.request.post(`/api/friends/requests/${friendId}`)).ok()).toBe(true);
  expect((await signedIn.request.post(`/api/friends/requests/${freshId}/accept`)).ok()).toBe(true);

  try {
    await freshLearner.goto(`/en/chat?with=${friendId}`);
    await expect(thread(freshLearner, account.displayName)).toBeAttached();
    const rows = freshLearner.getByRole('navigation', { name: 'Conversations' }).getByRole('link');
    await expect(rows).toHaveCount(1);
    await expect(rows).toHaveAccessibleName(new RegExp(account.displayName));
    await expect(rows).toHaveAttribute('aria-current', 'page');
    await expect(freshLearner.getByText('No conversations yet')).toHaveCount(0);
    await expectSilent([freshLearner], violations);
  } finally {
    // `account` is the worker's: its next test expects no friend but its pair.
    await freshLearner.request.delete(`/api/friends/${friendId}`);
  }
});

/**
 * The reader's side, whose partner has the longest name allowed. One word as
 * long as a message may be, with nowhere to break, then enough lines that the
 * thread holds more than its pane.
 */
test('a long thread scrolls in its own pane on a desktop, and the screens fit a phone', async ({
  onboarded: writer,
  signedIn: reader,
  ids,
  onboardedAccount,
}) => {
  const violations = [watchConsole(writer), watchConsole(reader)];
  const live = liveConnection(writer);
  await writer.goto(`/en/chat?with=${ids.signedIn}`);
  await live;

  // One letter too many is refused before sending, and the error goes as the text changes.
  const word = crypto.randomUUID().replace(/-/g, '').padEnd(MESSAGE_MAX_LENGTH, 'x');
  const composer = writer.locator('form').filter({ has: box(writer) });
  await box(writer).fill(`${word}x`);
  await box(writer).press('Enter');
  await expect(composer.getByRole('alert')).toHaveText('A message is limited to 1,000 characters');
  await box(writer).press('Backspace');
  await expect(composer.getByRole('alert')).toHaveCount(0);
  await send(writer, word);
  const newest = unique('newest');
  for (const label of [unique('tall'), unique('taller'), newest]) {
    await send(writer, [label, 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'].join('\n'));
  }

  const path = `/en/chat?with=${ids.onboarded}`;
  await reader.goto(path);
  const log = thread(reader, onboardedAccount.displayName);
  // It opens on the newest message, inside a pane that scrolls on its own.
  await expect(item(log, newest)).toBeInViewport();
  const pane = log.locator('..');
  expect(await pane.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await expectPinned(reader, path);
  await expect.poll(() => unread(reader)).toBe(0);

  await reader.setViewportSize(PHONE);
  await expectFitsTheScreen(reader, `${path} (thread)`);

  await reader.getByRole('link', { name: 'All messages' }).click();
  await expect(reader).toHaveURL(/\/en\/chat$/);
  await expect(
    reader
      .getByRole('navigation', { name: 'Conversations' })
      .getByRole('link', { name: onboardedAccount.displayName }),
  ).toBeVisible();
  await expectFitsTheScreen(reader, '/en/chat');

  // While friends: their row and their profile, each with Message beside Remove.
  await reader.goto('/en/friends');
  const friendRow = reader
    .getByRole('region', { name: 'Your friends' })
    .getByRole('listitem')
    .filter({ hasText: onboardedAccount.displayName });
  await expect(friendRow.getByRole('link', { name: 'Message', exact: true })).toBeVisible();
  await expect(friendRow.getByRole('button', { name: 'Remove' })).toBeVisible();
  await expectFitsTheScreen(reader, '/en/friends');

  await friendRow.getByRole('link', { name: onboardedAccount.displayName }).click();
  await expect(reader.getByRole('heading', { level: 1 })).toHaveText(onboardedAccount.displayName);
  await expect(reader.getByRole('button', { name: 'Remove' })).toBeVisible();
  await expectFitsTheScreen(reader, new URL(reader.url()).pathname);

  await reader.getByRole('link', { name: 'Message', exact: true }).click();
  await expect(reader).toHaveURL(new RegExp(`/en/chat\\?with=${ids.onboarded}$`));
  await expect(item(log, newest)).toBeVisible();

  await expectSilent([writer, reader], violations);
});

/**
 * The widest header there is: German, the longest name, both courses in the
 * switcher (as layout.spec.ts measures it), and the count on Messages. The
 * switcher is on the course pages only, so it is measured there, with the
 * account menu closed and open, then Messages is reached through its link.
 */
test('in German, the header fits a phone with a count, which the conversation clears', async ({
  onboarded: reader,
  signedIn: writer,
  ids,
  account,
}) => {
  await placeCourse(reader, SECOND_COURSE);
  await reader.setViewportSize(PHONE);
  const violations = [watchConsole(reader), watchConsole(writer)];
  const live = [liveConnection(reader), liveConnection(writer)];
  await Promise.all([
    reader.goto(`/de/learn/${ONBOARDED_COURSE.lang}`),
    writer.goto(`/de/chat?with=${ids.onboarded}`),
  ]);
  await Promise.all(live);

  const text = unique('hallo');
  await send(writer, text, 'Nachricht schreiben');

  // Closed, the menu button shows the count; open, the Messages link does.
  const menu = menuButton(reader, 'Menü');
  await expect(menu).toHaveAccessibleName('Menü 1 ungelesene Nachricht');
  await expectFitsTheScreen(reader, `/de/learn/${ONBOARDED_COURSE.lang}`);
  await openMenu(reader, 'Menü');
  await expect(messagesLink(reader, 'Nachrichten', 'Konto')).toHaveAccessibleName(
    'Nachrichten 1 ungelesene Nachricht',
  );
  await expectFitsTheScreen(reader, `/de/learn/${ONBOARDED_COURSE.lang} (menu open)`);

  await messagesLink(reader, 'Nachrichten', 'Konto').click();
  await expect(reader).toHaveURL(/\/de\/chat$/);
  await expectFitsTheScreen(reader, '/de/chat');

  await reader
    .getByRole('navigation', { name: 'Unterhaltungen' })
    .getByRole('link', { name: account.displayName })
    .click();
  await expect(item(thread(reader, account.displayName), text)).toBeVisible();
  // The count was on screen until this page opened, so its going is the read.
  // Following the link closed the menu, so the count is gone from its button.
  await expect(menu).toHaveAccessibleName('Menü');
  await expect.poll(() => unread(reader)).toBe(0);

  await expectSilent([reader, writer], violations);
});

/**
 * The issue's "after a reconnect, the client fetches what it missed": the
 * reader's socket drops with the thread open, a message comes meanwhile, and
 * the thread has it once the socket is back, read.
 */
test('a message sent while the socket was down arrives when it is back', async ({
  onboarded: writer,
  signedIn: reader,
  ids,
  onboardedAccount,
}) => {
  const violations = [watchConsole(writer), watchConsole(reader)];
  // Through a route only to have a handle that drops it.
  let socket: WebSocketRoute | undefined;
  await reader.routeWebSocket('**/ws/**', (ws) => {
    ws.connectToServer();
    socket = ws;
  });
  const live = [liveConnection(writer), liveConnection(reader)];
  await Promise.all([
    writer.goto(`/en/chat?with=${ids.signedIn}`),
    reader.goto(`/en/chat?with=${ids.onboarded}`),
  ]);
  await Promise.all(live);

  // The tab redials only once its probe says the API is up, so a down probe
  // keeps it away as an outage would. A dial refused by the route instead
  // would sit out socket.io's 20 s connect timeout.
  await reader.route('**/healthz/api', (route) => route.fulfill({ json: { api: 'down' } }));
  await socket!.close();
  await expect(reader.getByText('Reconnecting…')).toBeVisible();

  const missed = unique('missed');
  await send(writer, missed);
  const log = thread(reader, onboardedAccount.displayName);
  await expect(item(log, missed)).toHaveCount(0);

  const back = liveConnection(reader);
  await reader.unroute('**/healthz/api');
  await back;
  // No socket of the reader's heard its dm:message, so this is the catch-up's.
  await expect(item(log, missed)).toBeVisible();
  await expect.poll(() => unread(reader)).toBe(0);
  await expectSilent([writer, reader], violations);
});

/**
 * Removing a friend keeps the conversation readable by both (the privacy
 * notice says so) but closes it: no box, and a line saying why.
 */
test('a thread with an ex-friend stays readable, without a box', async ({
  onboarded: writer,
  signedIn: reader,
  ids,
  onboardedAccount,
}) => {
  const violations = [watchConsole(writer), watchConsole(reader)];
  const live = [liveConnection(writer), liveConnection(reader)];
  await Promise.all([
    writer.goto(`/en/chat?with=${ids.signedIn}`),
    reader.goto(`/en/chat?with=${ids.onboarded}`),
  ]);
  await Promise.all(live);

  const text = unique('before');
  await send(writer, text);
  const log = thread(reader, onboardedAccount.displayName);
  await expect(item(log, text)).toBeVisible();
  await expect.poll(() => unread(reader)).toBe(0);

  // The teardown's unfriend then finds nothing to end, which it allows.
  expect((await writer.request.delete(`/api/friends/${ids.signedIn}`)).status()).toBe(204);
  const expectReadOnly = async () => {
    await expect(box(reader)).toHaveCount(0);
    await expect(reader.getByText('Only friends can message each other')).toBeVisible();
    await expect(item(log, text)).toBeVisible();
  };
  // Live first, from the refresh friend:removed makes, then as rendered.
  await expectReadOnly();
  await reader.reload();
  await expectReadOnly();

  await expectSilent([writer, reader], violations);
});

/** A time as the page words it for today, in one zone. */
const clock = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('en', { timeStyle: 'short', timeZone }).format(new Date(iso));

const setTimeZone = async (page: Page, timeZone: string) => {
  expect((await page.request.patch('/api/users/me', { data: { timeZone } })).ok()).toBe(true);
};

test.describe('in the time zone of the account', () => {
  // Anything but the UTC of the server and of every other spec.
  test.use({ timezoneId: 'Europe/Paris' });

  test('a message shows its time in Paris, as sent and as rendered', async ({
    onboarded: writer,
    signedIn: reader,
    ids,
    account,
    onboardedAccount,
  }) => {
    // Stored before any visit, so neither page syncs its zone and refreshes mid-test.
    await Promise.all([setTimeZone(writer, 'Europe/Paris'), setTimeZone(reader, 'Europe/Paris')]);
    try {
      const violations = [watchConsole(writer), watchConsole(reader)];
      const live = liveConnection(writer);
      await writer.goto(`/en/chat?with=${ids.signedIn}`);
      await live;

      const text = unique('bonjour');
      await send(writer, text);
      const sent = item(thread(writer, account.displayName), text);
      const at = await sent.locator('time').getAttribute('datetime');
      expect(at).not.toBeNull();
      const paris = clock(at!, 'Europe/Paris');
      // Paris is never on UTC, so the wrong zone cannot pass by chance.
      expect(paris).not.toBe(clock(at!, 'UTC'));
      // Contained, not equal: one sent before midnight in Paris also shows its date.
      await expect(sent.locator('time')).toContainText(paris);

      await reader.goto(`/en/chat?with=${ids.onboarded}`);
      const received = item(thread(reader, onboardedAccount.displayName), text);
      await expect(received.locator('time')).toContainText(paris);
      await expect.poll(() => unread(reader)).toBe(0);

      await expectSilent([writer, reader], violations);
    } finally {
      // Off the pages first: the teardown's unfriend refreshes an open page,
      // and its TimeZoneSync would store this browser's Paris again.
      await Promise.all([writer.goto('about:blank'), reader.goto('about:blank')]);
      // The column default every other test runs with.
      await Promise.all([setTimeZone(writer, 'UTC'), setTimeZone(reader, 'UTC')]);
    }
  });
});
