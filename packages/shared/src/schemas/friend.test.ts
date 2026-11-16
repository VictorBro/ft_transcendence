import { describe, expect, it } from 'vitest';

import { FriendsSchema } from './index';

const someone = {
  id: '3f0f9d1e-8a2c-4f3b-9c1d-6d2c5b8a7e41',
  displayName: 'ada',
  avatarUrl: null,
};

describe('FriendsSchema', () => {
  it('says whether each friend is online', () => {
    const lists = { friends: [{ ...someone, online: true }], received: [], sent: [] };

    expect(FriendsSchema.parse(lists).friends[0]?.online).toBe(true);
  });

  it('refuses a friend without it', () => {
    expect(FriendsSchema.safeParse({ friends: [someone], received: [], sent: [] }).success).toBe(
      false,
    );
  });

  // Presence is for friends only: a pending request does not carry it.
  it('drops it from a request', () => {
    const lists = { friends: [], received: [{ ...someone, online: true }], sent: [] };

    expect(FriendsSchema.parse(lists).received[0]).toEqual(someone);
  });
});
