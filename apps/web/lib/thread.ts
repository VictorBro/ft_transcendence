import type { Message, MessagePage } from '@ft/shared';

/**
 * What the thread on /chat holds and how news joins it, kept pure so it can be
 * tested here. A thread is a MessagePage: its messages oldest first, and the
 * cursor of the page before them.
 */

// The server's order: time, then id for two stored in the same millisecond.
function oldestFirst(a: Message, b: Message): number {
  const byTime = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (byTime !== 0) return byTime;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Both lists as one, oldest first, each message once: a catch-up's page
 * overlaps what the thread holds.
 */
export function mergeMessages(held: Message[], incoming: Message[]): Message[] {
  const byId = new Map(held.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(oldestFirst);
}

/**
 * The newest page, fetched after a connect, merged into what the thread holds.
 * `before` is what it held when the fetch started: a message heard live since
 * may be in the page too, and says nothing about the gap. When the page does
 * not reach `before`, more than a page arrived while the tab was away, and
 * what lies between is unknown: the thread starts again from that page, keeps
 * what was heard after it, and the earlier ones load again on demand.
 */
export function catchUp(held: MessagePage, newest: MessagePage, before: Message[]): MessagePage {
  const ids = new Set(before.map((message) => message.id));
  const meets = newest.nextCursor === null || newest.messages.some(({ id }) => ids.has(id));

  if (meets) {
    return { messages: mergeMessages(held.messages, newest.messages), nextCursor: held.nextCursor };
  }
  const last = newest.messages.at(-1);
  const later = held.messages.filter(
    (message) => last !== undefined && oldestFirst(message, last) > 0,
  );
  return { messages: mergeMessages(newest.messages, later), nextCursor: newest.nextCursor };
}

/**
 * An earlier page in front of what the thread holds. Dropped when the thread
 * no longer waits on that cursor: a catch-up started it again meanwhile.
 */
export function addEarlier(held: MessagePage, cursor: string, earlier: MessagePage): MessagePage {
  if (held.nextCursor !== cursor) return held;
  return {
    messages: mergeMessages(earlier.messages, held.messages),
    nextCursor: earlier.nextCursor,
  };
}

/**
 * The time for a message of today, the date and time otherwise, both in the
 * reader's time zone, or this browser's when its ICU does not know that one:
 * the zone is checked on write only, maybe by a newer browser.
 */
export function timeFormat(
  createdAt: string,
  stored: string,
  now: Date,
): Pick<Intl.DateTimeFormatOptions, 'dateStyle' | 'timeStyle' | 'timeZone'> {
  const timeZone = knownZone(stored);
  const day = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const today = day.format(new Date(createdAt)) === day.format(now);

  return today
    ? { timeStyle: 'short', timeZone }
    : { dateStyle: 'medium', timeStyle: 'short', timeZone };
}

// By name rather than undefined: next-intl would fill that in with the server's zone.
function knownZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return timeZone;
  } catch {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
}
