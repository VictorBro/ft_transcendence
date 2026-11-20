import type { DmUnread } from '@ft/shared';

import type { PrismaService } from '../prisma/prisma.service';

/**
 * What `me` has not read, per conversation: in a conversation of mine, a sender
 * who is not me is the other user, so their id is the key. A function like
 * friend-ids.ts: the gateway sends it on connect and cannot import MessagesModule.
 */
export async function unreadCounts(prisma: PrismaService, me: string): Promise<DmUnread> {
  // Before the query: a stamp taken after it could outrank the snapshot of a write it missed.
  const at = new Date().toISOString();
  const rows = await prisma.message.groupBy({
    by: ['senderId'],
    where: {
      readAt: null,
      senderId: { not: me },
      conversation: { OR: [{ userAId: me }, { userBId: me }] },
    },
    _count: { _all: true },
  });
  return { counts: Object.fromEntries(rows.map((row) => [row.senderId, row._count._all])), at };
}
