import { describe, expect, it, vi } from 'vitest';
import type { PresenceStatus } from '@ft/shared';

import { createPresenceMap } from './presence';

const BOB = '00000000-0000-4000-8000-000000000001';
const ZOE = '00000000-0000-4000-8000-000000000002';

const update = (userId: string, status: PresenceStatus) => ({
  userId,
  status,
  at: new Date().toISOString(),
});

describe('createPresenceMap', () => {
  it('knows nothing until it hears something, so the rendered value wins', () => {
    const map = createPresenceMap();

    expect(map.get(BOB)).toBeUndefined();
  });

  it('keeps the latest status of each friend', () => {
    const map = createPresenceMap();

    map.apply(update(BOB, 'online'));
    map.apply(update(ZOE, 'online'));
    map.apply(update(BOB, 'offline'));

    expect(map.get(BOB)).toBe(false);
    expect(map.get(ZOE)).toBe(true);
  });

  it('tells its watchers of a change, and only of a change', () => {
    const map = createPresenceMap();
    const watch = vi.fn();
    map.subscribe(watch);

    map.apply(update(BOB, 'online'));
    // The snapshot on connect repeats what the tab may already know.
    map.apply(update(BOB, 'online'));

    expect(watch).toHaveBeenCalledTimes(1);
  });

  it('forgets a removed friend', () => {
    const map = createPresenceMap();
    map.apply(update(BOB, 'online'));
    const watch = vi.fn();
    map.subscribe(watch);

    map.forget(BOB);
    map.forget(ZOE);

    expect(map.get(BOB)).toBeUndefined();
    expect(watch).toHaveBeenCalledTimes(1);
  });

  it('forgets everyone on clear', () => {
    const map = createPresenceMap();
    map.apply(update(BOB, 'online'));
    map.apply(update(ZOE, 'offline'));

    map.clear();

    expect(map.get(BOB)).toBeUndefined();
    expect(map.get(ZOE)).toBeUndefined();
  });

  it('stops telling a watcher that unsubscribed', () => {
    const map = createPresenceMap();
    const watch = vi.fn();
    const unsubscribe = map.subscribe(watch);

    unsubscribe();
    map.apply(update(BOB, 'online'));

    expect(watch).not.toHaveBeenCalled();
  });
});
