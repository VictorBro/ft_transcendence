import type { PrismaService } from '../prisma/prisma.service';

/**
 * The ids of everyone `me` is friends with. A function rather than a
 * FriendsService method: the gateway needs it, and FriendsModule already
 * imports GatewayModule.
 */
export async function friendIds(prisma: PrismaService, me: string): Promise<string[]> {
  const rows = await prisma.friendship.findMany({
    where: { status: 'accepted', OR: [{ requesterId: me }, { addresseeId: me }] },
    select: { requesterId: true, addresseeId: true },
  });
  return rows.map((row) => (row.requesterId === me ? row.addresseeId : row.requesterId));
}
