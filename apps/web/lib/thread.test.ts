import { describe, expect, it } from 'vitest';
import type { Message } from '@ft/shared';

import { addEarlier, catchUp, mergeMessages, timeFormat } from './thread';

const ME = '00000000-0000-4000-8000-000000000001';

// Ids sort in the order of their last digit, like the server compares them.
const message = (n: number, createdAt = `2026-11-16T10:00:0${n}.000Z`): Message => ({
  id: `00000000-0000-4000-8000-00000000010${n}`,
  senderId: ME,
  text: `message ${n}`,
  createdAt,
});

const ids = (messages: Message[]) => messages.map(({ text }) => text);

describe('mergeMessages', () => {
  it('keeps each message once, oldest first', () => {
    const merged = mergeMessages([message(1), message(3)], [message(3), message(2)]);

    expect(ids(merged)).toEqual(['message 1', 'message 2', 'message 3']);
  });

  it('orders two of the same millisecond by id', () => {
    const at = '2026-11-16T10:00:00.000Z';

    expect(ids(mergeMessages([message(2, at)], [message(1, at)]))).toEqual([
      'message 1',
      'message 2',
    ]);
  });
});

describe('catchUp', () => {
  it('merges a newest page that reaches what the thread holds', () => {
    const held = { messages: [message(1), message(2)], nextCursor: message(1).id };
    const newest = { messages: [message(2), message(3)], nextCursor: message(2).id };

    expect(catchUp(held, newest, held.messages)).toEqual({
      messages: [message(1), message(2), message(3)],
      nextCursor: message(1).id,
    });
  });

  it('merges a newest page that is the whole conversation', () => {
    const held = { messages: [], nextCursor: null };
    const newest = { messages: [message(1)], nextCursor: null };

    expect(catchUp(held, newest, held.messages)).toEqual(newest);
  });

  // More than a page while away: what lies between the two is unknown.
  it('starts again from a newest page that does not reach what the thread holds', () => {
    const held = { messages: [message(1)], nextCursor: null };
    const newest = { messages: [message(8), message(9)], nextCursor: message(8).id };

    expect(catchUp(held, newest, held.messages)).toEqual(newest);
  });

  // 9 came live during the fetch and was stored before the page was read.
  it('does not take a message heard during the fetch for the gap closing', () => {
    const before = [message(1), message(2)];
    const held = { messages: [...before, message(9)], nextCursor: null };
    const newest = { messages: [message(7), message(8), message(9)], nextCursor: message(7).id };

    expect(catchUp(held, newest, before)).toEqual(newest);
  });

  // 9 came live during the fetch and was stored after the page was read.
  it('keeps a message heard during the fetch when it starts again', () => {
    const before = [message(1), message(2)];
    const held = { messages: [...before, message(9)], nextCursor: null };
    const newest = { messages: [message(6), message(7), message(8)], nextCursor: message(6).id };

    expect(catchUp(held, newest, before)).toEqual({
      messages: [message(6), message(7), message(8), message(9)],
      nextCursor: message(6).id,
    });
  });
});

describe('addEarlier', () => {
  it('puts the earlier page in front, and takes its cursor', () => {
    const held = { messages: [message(3)], nextCursor: message(3).id };
    const earlier = { messages: [message(1), message(2)], nextCursor: message(1).id };

    expect(addEarlier(held, message(3).id, earlier)).toEqual({
      messages: [message(1), message(2), message(3)],
      nextCursor: message(1).id,
    });
  });

  it('drops a page the thread no longer waits for', () => {
    const held = { messages: [message(9)], nextCursor: message(9).id };
    const earlier = { messages: [message(1)], nextCursor: null };

    expect(addEarlier(held, message(3).id, earlier)).toBe(held);
  });
});

describe('timeFormat', () => {
  const now = new Date('2026-11-16T23:30:00.000Z');

  it('shows only the time for a message of today', () => {
    expect(timeFormat('2026-11-16T08:00:00.000Z', 'UTC', now)).toEqual({
      timeStyle: 'short',
      timeZone: 'UTC',
    });
  });

  it('shows the date too for an older message', () => {
    expect(timeFormat('2026-11-15T23:00:00.000Z', 'UTC', now)).toEqual({
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    });
  });

  // 23:30 UTC is already 00:30 on the 17th in Paris: 23:00 there is the day before.
  it('decides what today is in the time zone of the reader', () => {
    expect(timeFormat('2026-11-16T22:00:00.000Z', 'Europe/Paris', now).dateStyle).toBe('medium');
    expect(timeFormat('2026-11-16T23:15:00.000Z', 'Europe/Paris', now).dateStyle).toBeUndefined();
  });

  // A zone stored by a newer browser may be unknown to this one's ICU.
  it("falls back to the browser's zone for one Intl rejects", () => {
    const browser = new Intl.DateTimeFormat().resolvedOptions().timeZone;

    expect(timeFormat('2026-11-16T08:00:00.000Z', 'Not/A_Zone', now).timeZone).toBe(browser);
  });
});
