import { describe, expect, it, vi } from 'vitest';

import { badgeText, createPendingStore, createUnreadStore, menuTotal, unreadTotal } from './unread';

const BOB = '00000000-0000-4000-8000-000000000001';
const ZOE = '00000000-0000-4000-8000-000000000002';

const snapshot = (counts: Record<string, number>, at: string) => ({ counts, at });

describe('createUnreadStore', () => {
  it('knows nothing until the first snapshot, so the rendered count wins', () => {
    expect(createUnreadStore().get()).toBeUndefined();
  });

  // A conversation read since is left out of the next snapshot, not sent as 0.
  it('replaces the counts with each snapshot rather than merging them', () => {
    const store = createUnreadStore();

    store.apply(snapshot({ [BOB]: 2, [ZOE]: 1 }, '2026-11-16T10:00:00.000Z'));
    store.apply(snapshot({ [ZOE]: 3 }, '2026-11-16T10:00:01.000Z'));

    expect(store.get()).toEqual({ [ZOE]: 3 });
  });

  it('keeps the later count when two snapshots arrive out of order', () => {
    const store = createUnreadStore();

    store.apply(snapshot({}, '2026-11-16T10:00:01.000Z'));
    store.apply(snapshot({ [BOB]: 1 }, '2026-11-16T10:00:00.500Z'));

    expect(store.get()).toEqual({});
  });

  // Seconds without a fraction: compared as times, not as text.
  it('compares stamps as times whatever their precision', () => {
    const store = createUnreadStore();

    store.apply(snapshot({ [BOB]: 1 }, '2026-11-16T10:00:00.500Z'));
    store.apply(snapshot({}, '2026-11-16T10:00:01Z'));

    expect(store.get()).toEqual({});
  });

  it('tells its watchers of every snapshot it keeps, an unchanged one too', () => {
    const store = createUnreadStore();
    const watch = vi.fn();
    store.subscribe(watch);

    store.apply(snapshot({ [BOB]: 1 }, '2026-11-16T10:00:00.000Z'));
    store.apply(snapshot({ [BOB]: 1 }, '2026-11-16T10:00:01.000Z'));
    store.apply(snapshot({}, '2026-11-16T09:00:00.000Z'));

    expect(watch).toHaveBeenCalledTimes(2);
  });

  it('forgets everything on clear, and takes any snapshot after it', () => {
    const store = createUnreadStore();
    store.apply(snapshot({ [BOB]: 1 }, '2026-11-16T10:00:00.000Z'));

    store.clear();
    expect(store.get()).toBeUndefined();

    store.apply(snapshot({ [ZOE]: 2 }, '2026-11-16T09:00:00.000Z'));
    expect(store.get()).toEqual({ [ZOE]: 2 });
  });

  it('stops telling a watcher that unsubscribed', () => {
    const store = createUnreadStore();
    const watch = vi.fn();
    const unsubscribe = store.subscribe(watch);

    unsubscribe();
    store.apply(snapshot({ [BOB]: 1 }, '2026-11-16T10:00:00.000Z'));

    expect(watch).not.toHaveBeenCalled();
  });
});

describe('createPendingStore', () => {
  const pending = (count: number, at: string) => ({ count, at });

  it('knows nothing until the first snapshot, so the rendered count wins', () => {
    expect(createPendingStore().get()).toBeUndefined();
  });

  it('replaces the count with each snapshot', () => {
    const store = createPendingStore();

    store.apply(pending(2, '2026-11-16T10:00:00.000Z'));
    store.apply(pending(1, '2026-11-16T10:00:01.000Z'));

    expect(store.get()).toBe(1);
  });

  // A request declined in one tab while another arrives: the later count wins.
  it('keeps the later count when two snapshots arrive out of order', () => {
    const store = createPendingStore();

    store.apply(pending(0, '2026-11-16T10:00:01.000Z'));
    store.apply(pending(1, '2026-11-16T10:00:00.000Z'));

    expect(store.get()).toBe(0);
  });

  it('forgets the count on clear, and takes any snapshot after it', () => {
    const store = createPendingStore();
    store.apply(pending(3, '2026-11-16T10:00:00.000Z'));

    store.clear();
    expect(store.get()).toBeUndefined();

    store.apply(pending(1, '2026-11-16T09:00:00.000Z'));
    expect(store.get()).toBe(1);
  });

  it('tells its watchers only of the snapshots it keeps', () => {
    const store = createPendingStore();
    const watch = vi.fn();
    store.subscribe(watch);

    store.apply(pending(1, '2026-11-16T10:00:00.000Z'));
    store.apply(pending(2, '2026-11-16T09:00:00.000Z'));

    expect(watch).toHaveBeenCalledOnce();
    expect(store.get()).toBe(1);
  });
});

describe('menuTotal', () => {
  it.each([
    [undefined, undefined, undefined],
    [undefined, 2, 2],
    [3, undefined, 3],
    [3, 2, 5],
    [0, 0, 0],
  ])('adds %s unread and %s requests to %s', (unread, requests, total) => {
    expect(menuTotal(unread, requests)).toBe(total);
  });
});

describe('badgeText', () => {
  it('shows the count up to 99, then 99+', () => {
    expect([1, 99, 100, 1234].map(badgeText)).toEqual(['1', '99', '99+', '99+']);
  });
});

describe('unreadTotal', () => {
  it('adds up every conversation', () => {
    expect(unreadTotal({ [BOB]: 2, [ZOE]: 3 })).toBe(5);
  });

  it('is 0 with nothing unread', () => {
    expect(unreadTotal({})).toBe(0);
  });
});
