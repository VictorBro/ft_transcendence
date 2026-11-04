import { describe, expect, it } from 'vitest';

import { relationTo } from './friends';

const person = (id: string) => ({ id, displayName: `user_${id}`, avatarUrl: null });

const lists = {
  friends: [person('f')],
  received: [person('r')],
  sent: [person('s')],
};

describe('relationTo', () => {
  it.each([
    ['f', 'friend'],
    ['r', 'received'],
    ['s', 'sent'],
    ['x', 'none'],
  ] as const)('reads %s as %s', (userId, relation) => {
    expect(relationTo(lists, userId)).toBe(relation);
  });
});
