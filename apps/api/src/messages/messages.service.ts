import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectThrottlerStorage, type ThrottlerStorage } from '@nestjs/throttler';
import { MESSAGE_PAGE_SIZE, SERVER_EVENTS } from '@ft/shared';
import type { Conversations, Message, MessagePage } from '@ft/shared';

import { areFriends } from '../friends/friend-ids';
import { pairKey } from '../friends/pair';
import type { Prisma } from '../generated/prisma/client';
import { SocketsService } from '../gateway/sockets.service';
import { PrismaService } from '../prisma/prisma.service';
import { RATE_LIMITS } from '../throttler/rate-limits';
import { PUBLIC_USER_SELECT } from '../users/public-user';
import { unreadCounts } from './unread';

// Per account: a write that pushes to another person, like friend requests at
// 10 a minute. 30 is far above anyone typing.
export const SEND_LIMIT_PER_MINUTE = 30;
// Per account, as an HTTP route is: a read costs two queries and a snapshot to
// every tab, and the thread asks about once per message it is shown.
export const READ_LIMIT_PER_MINUTE = RATE_LIMITS.perAccount;

const MESSAGE_SELECT = { id: true, senderId: true, text: true, createdAt: true } as const;

function toMessage(row: { id: string; senderId: string; text: string; createdAt: Date }): Message {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

/**
 * Every query is built from the caller's own id, and the pair key from it and
 * the other user's, so a conversation that does not include the caller is
 * unreachable.
 */
@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sockets: SocketsService,
    // The HTTP throttler's: gateways never get its guard, so the budgets count here.
    @InjectThrottlerStorage() private readonly throttler: ThrottlerStorage,
  ) {}

  async send(me: string, them: string, text: string): Promise<Message> {
    // When it arrived, and one instant for the message and the list's order.
    const now = new Date();
    // Before the friendship check: a refused send costs a query too.
    await this.spend('dm:send', me, SEND_LIMIT_PER_MINUTE);
    if (!(await areFriends(this.prisma, me, them))) {
      throw new ForbiddenException('message.notFriends');
    }
    const key = pairKey(me, them);
    const [userAId, userBId] = [me, them].sort();
    const [, row] = await this.prisma.$transaction([
      this.prisma.conversation.upsert({
        where: { pairKey: key },
        create: { pairKey: key, userAId, userBId, createdAt: now, lastMessageAt: now },
        update: { lastMessageAt: now },
      }),
      this.prisma.message.create({
        data: { pairKey: key, senderId: me, text, createdAt: now },
        select: MESSAGE_SELECT,
      }),
    ]);
    const message = toMessage(row);
    // Both rooms: the sending tab gets it too, and the page dedupes by id.
    this.sockets.toUser(them, SERVER_EVENTS.DM_MESSAGE, { userId: me, message });
    this.sockets.toUser(me, SERVER_EVENTS.DM_MESSAGE, { userId: them, message });
    // Not awaited: the message is stored and delivered, so the ack never waits on the count.
    void this.tellUnread(them);
    return message;
  }

  /** Answered with a snapshot whether or not anything changed, so every read converges. */
  async read(me: string, them: string): Promise<void> {
    await this.spend('dm:read', me, READ_LIMIT_PER_MINUTE);
    await this.prisma.message.updateMany({
      where: { pairKey: pairKey(me, them), senderId: them, readAt: null },
      data: { readAt: new Date() },
    });
    await this.tellUnread(me);
  }

  async conversations(me: string): Promise<Conversations> {
    const [rows, unread] = await Promise.all([
      this.prisma.conversation.findMany({
        where: { OR: [{ userAId: me }, { userBId: me }] },
        select: {
          userAId: true,
          userA: { select: PUBLIC_USER_SELECT },
          userB: { select: PUBLIC_USER_SELECT },
          lastMessageAt: true,
        },
        orderBy: { lastMessageAt: 'desc' },
      }),
      unreadCounts(this.prisma, me),
    ]);
    return {
      conversations: rows.map((row) => {
        const user = row.userAId === me ? row.userB : row.userA;
        return {
          user,
          lastMessageAt: row.lastMessageAt.toISOString(),
          unread: unread.counts[user.id] ?? 0,
        };
      }),
    };
  }

  /**
   * The newest page, or the one before `cursor`. No friendship needed: the
   * history stays readable by both after unfriending.
   */
  async page(me: string, them: string, cursor?: string): Promise<MessagePage> {
    const key = pairKey(me, them);
    let before: Prisma.MessageWhereInput = {};
    if (cursor !== undefined) {
      const from = await this.prisma.message.findFirst({
        where: { id: cursor, pairKey: key },
        select: { id: true, createdAt: true },
      });
      if (from === null) {
        throw new BadRequestException('request.invalid');
      }
      // (createdAt, id) strictly before the cursor: two messages may share a millisecond.
      before = {
        OR: [
          { createdAt: { lt: from.createdAt } },
          { createdAt: from.createdAt, id: { lt: from.id } },
        ],
      };
    }
    // One more than a page tells whether an older one exists.
    const rows = await this.prisma.message.findMany({
      where: { pairKey: key, ...before },
      select: MESSAGE_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MESSAGE_PAGE_SIZE + 1,
    });
    const messages = rows.slice(0, MESSAGE_PAGE_SIZE).reverse().map(toMessage);
    return {
      messages,
      nextCursor: rows.length > MESSAGE_PAGE_SIZE ? messages[0].id : null,
    };
  }

  /** One `event` from the account, refused past its budget of a minute, from all its sockets together. */
  private async spend(event: string, me: string, limit: number): Promise<void> {
    const { isBlocked } = await this.throttler.increment(
      `${event}:${me}`,
      60_000,
      limit,
      60_000,
      'default',
    );
    if (isBlocked) {
      throw new HttpException('server.rateLimited', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  /** The whole picture, to every tab of `userId`. A failure is logged, never thrown. */
  private async tellUnread(userId: string): Promise<void> {
    try {
      this.sockets.toUser(userId, SERVER_EVENTS.DM_UNREAD, await unreadCounts(this.prisma, userId));
    } catch (error) {
      this.logger.error(`unread count failed: ${String(error)}`);
    }
  }
}
