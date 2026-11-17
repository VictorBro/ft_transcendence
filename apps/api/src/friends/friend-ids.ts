import type { PrismaService } from '../prisma/prisma.service';
import { pairKey } from './pair';

// Functions, not FriendsService methods: the gateway cannot import
// FriendsModule, which imports it, and messages need no more than these.

/** The ids of everyone `me` is friends with. */
export async function friendIds(prisma: PrismaService, me: string): Promise<string[]> {
  const rows = await prisma.friendship.findMany({
    where: { status: 'accepted', OR: [{ requesterId: me }, { addresseeId: me }] },
    select: { requesterId: true, addresseeId: true },
  });
  return rows.map((row) => (row.requesterId === me ? row.addresseeId : row.requesterId));
}

/** A pending request is not a friendship, and nobody is their own friend. */
export async function areFriends(prisma: PrismaService, a: string, b: string): Promise<boolean> {
  const row = await prisma.friendship.findUnique({
    where: { pairKey: pairKey(a, b) },
    select: { status: true },
  });
  return row?.status === 'accepted';
}
