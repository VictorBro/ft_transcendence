import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { unreadCounts } from './unread';

const ME = 'b0000000-0000-4000-8000-000000000000';
const THEM = 'a0000000-0000-4000-8000-000000000000';
const OTHER = 'c0000000-0000-4000-8000-000000000000';

const prismaWith = (groupBy: ReturnType<typeof vi.fn>) =>
  ({ message: { groupBy } }) as unknown as PrismaService;

describe('unreadCounts', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts, per conversation of mine, what the other sent and I have not read', async () => {
    const groupBy = vi.fn().mockResolvedValue([
      { senderId: THEM, _count: { _all: 2 } },
      { senderId: OTHER, _count: { _all: 1 } },
    ]);

    const { counts } = await unreadCounts(prismaWith(groupBy), ME);

    expect(counts).toEqual({ [THEM]: 2, [OTHER]: 1 });
    expect(groupBy).toHaveBeenCalledWith({
      by: ['senderId'],
      where: {
        readAt: null,
        senderId: { not: ME },
        conversation: { OR: [{ userAId: ME }, { userBId: ME }] },
      },
      _count: { _all: true },
    });
  });

  it('leaves out every conversation with nothing unread', async () => {
    expect((await unreadCounts(prismaWith(vi.fn().mockResolvedValue([])), ME)).counts).toEqual({});
  });

  // A stamp taken after the count could claim a write the count missed.
  it('is stamped before the count, not after it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-16T10:00:00Z'));
    const groupBy = vi.fn(() => {
      vi.setSystemTime(new Date('2026-11-16T10:00:05Z'));
      return Promise.resolve([]);
    });

    const { at } = await unreadCounts(prismaWith(groupBy), ME);

    expect(at).toBe('2026-11-16T10:00:00.000Z');
  });
});
