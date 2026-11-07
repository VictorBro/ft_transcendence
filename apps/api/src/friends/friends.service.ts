import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SERVER_EVENTS } from '@ft/shared';
import type {
  ErrorCode,
  FriendRequestResult,
  Friends,
  FriendshipStatus,
  PublicUser,
} from '@ft/shared';

import { SocketsService } from '../gateway/sockets.service';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_USER_SELECT } from '../users/public-user';
import { PresenceService } from '../presence/presence.service';
import { pairKey } from './pair';

type FriendEventName =
  | typeof SERVER_EVENTS.FRIEND_REQUEST
  | typeof SERVER_EVENTS.FRIEND_ACCEPTED
  | typeof SERVER_EVENTS.FRIEND_REMOVED;

/** Duck-typed like the other services: no import of Prisma's runtime, and plain mocks pass. */
function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

/**
 * Every write names the other user, and the pair key is built from the
 * caller's own id, so a row that does not include the caller is unreachable.
 */
@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sockets: SocketsService,
    private readonly presence: PresenceService,
  ) {}

  async list(me: string): Promise<Friends> {
    const rows = await this.prisma.friendship.findMany({
      where: { OR: [{ requesterId: me }, { addresseeId: me }] },
      select: {
        status: true,
        requesterId: true,
        requester: { select: PUBLIC_USER_SELECT },
        addressee: { select: PUBLIC_USER_SELECT },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const lists: Friends = { friends: [], received: [], sent: [] };
    const friends: PublicUser[] = [];
    for (const row of rows) {
      const mine = row.requesterId === me;
      const other = mine ? row.addressee : row.requester;
      if (row.status === 'accepted') friends.push(other);
      else (mine ? lists.sent : lists.received).push(other);
    }
    const online = await this.presence.isOnline(friends.map((friend) => friend.id));
    lists.friends = friends.map((friend) => ({ ...friend, online: online.has(friend.id) }));
    return lists;
  }

  async send(me: string, them: string): Promise<FriendRequestResult> {
    if (them === me) {
      throw new BadRequestException('friend.self');
    }
    try {
      return await this.trySend(me, them);
    } catch (error) {
      // Their request got in between our read and our insert: read again, and
      // it is theirs to accept. Once only: if they cancel it in that gap too,
      // the 404 is the truth and the page's refresh shows it.
      if (hasCode(error, 'P2002')) return this.trySend(me, them);
      throw error;
    }
  }

  async accept(me: string, them: string): Promise<void> {
    const { count } = await this.prisma.friendship.updateMany({
      where: { pairKey: pairKey(me, them), requesterId: them, status: 'pending' },
      data: { status: 'accepted' },
    });
    if (count === 0) {
      throw new NotFoundException('friend.requestNotFound');
    }
    this.notify(me, them, SERVER_EVENTS.FRIEND_ACCEPTED);
  }

  /** Declines theirs or cancels yours: there is at most one request between two people. */
  async deleteRequest(me: string, them: string): Promise<void> {
    await this.drop(me, them, 'pending', 'friend.requestNotFound');
  }

  async remove(me: string, them: string): Promise<void> {
    await this.drop(me, them, 'accepted', 'friend.notFound');
  }

  private async trySend(me: string, them: string): Promise<FriendRequestResult> {
    const key = pairKey(me, them);
    const row = await this.prisma.friendship.findUnique({
      where: { pairKey: key },
      select: { status: true, requesterId: true },
    });
    if (row === null) {
      await this.create(key, me, them);
      this.notify(me, them, SERVER_EVENTS.FRIEND_REQUEST);
      return { status: 'pending' };
    }
    if (row.status === 'accepted') throw new ConflictException('friend.alreadyFriends');
    if (row.requesterId === me) throw new ConflictException('friend.alreadyRequested');
    await this.accept(me, them);
    return { status: 'accepted' };
  }

  private async create(key: string, me: string, them: string): Promise<void> {
    try {
      await this.prisma.friendship.create({
        data: { pairKey: key, requesterId: me, addresseeId: them },
      });
    } catch (error) {
      // Caught rather than pre-checked, like a taken name at signup.
      if (hasCode(error, 'P2003')) throw new NotFoundException('user.notFound');
      throw error;
    }
  }

  /** One conditional delete, so a stale tab cannot drop a friend through the requests route. */
  private async drop(
    me: string,
    them: string,
    status: FriendshipStatus,
    missing: ErrorCode,
  ): Promise<void> {
    const { count } = await this.prisma.friendship.deleteMany({
      where: { pairKey: pairKey(me, them), status },
    });
    if (count === 0) {
      throw new NotFoundException(missing);
    }
    this.notify(me, them, SERVER_EVENTS.FRIEND_REMOVED);
  }

  /** After the write, to both rooms: the other user, and the actor's other tabs. */
  private notify(me: string, them: string, event: FriendEventName): void {
    this.sockets.toUser(them, event, { userId: me });
    this.sockets.toUser(me, event, { userId: them });
  }
}
