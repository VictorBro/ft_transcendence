import { BadRequestException, ForbiddenException, HttpException, Logger } from '@nestjs/common';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { MESSAGE_PAGE_SIZE } from '@ft/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pairKey } from '../friends/pair';
import type { AppSocket, SocketsService } from '../gateway/sockets.service';
import type { PrismaService } from '../prisma/prisma.service';
import { MessagesGateway } from './messages.gateway';
import { MessagesService, READ_LIMIT_PER_MINUTE, SEND_LIMIT_PER_MINUTE } from './messages.service';

/**
 * What Supertest cannot see: one transaction for the two writes, one instant
 * for both, a send that answers whatever the unread count does, and the
 * budgets across sockets.
 */

// THEM sorts first: the conversation's userA.
const ME = 'b0000000-0000-4000-8000-000000000000';
const THEM = 'a0000000-0000-4000-8000-000000000000';
const OTHER = 'c0000000-0000-4000-8000-000000000000';
const NOW = new Date('2026-11-16T10:00:00Z');

const person = (id: string) => ({ id, displayName: `user-${id[0]}`, avatarUrl: null });
const row = (id: string, createdAt: Date, senderId = ME) => ({
  id,
  senderId,
  text: `text ${id}`,
  createdAt,
});
const unread = (counts: Record<string, number>) => ({ counts, at: expect.any(String) });
// Two tabs of ME: each socket has its own screen, and an account may hold many.
const [one, two] = ['s1', 's2'].map(
  (sessionId) => ({ data: { userId: ME, sessionId } }) as unknown as AppSocket,
);

/** ME and THEM are friends, nothing is unread, and every write succeeds, unless a test says otherwise. */
function serviceWith() {
  const prisma = {
    friendship: {
      findUnique: vi.fn(({ where }: { where: { pairKey: string } }) =>
        Promise.resolve(where.pairKey === pairKey(ME, THEM) ? { status: 'accepted' } : null),
      ),
    },
    conversation: {
      upsert: vi.fn().mockReturnValue('upsert'),
      findMany: vi.fn().mockResolvedValue([]),
    },
    message: {
      create: vi.fn().mockReturnValue('create'),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn().mockResolvedValue([{}, row('m1', NOW)]),
  };
  const sockets = { toUser: vi.fn() };
  const service = new MessagesService(
    prisma as unknown as PrismaService,
    sockets as unknown as SocketsService,
    new ThrottlerStorageService(),
  );
  return { service, prisma, toUser: sockets.toUser };
}

/** Lets the unread count a send starts, and does not wait on, run to its end. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('MessagesService send', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['a stranger', OTHER, null],
    ['someone with a pending request', OTHER, { status: 'pending' }],
    ['yourself', ME, undefined],
  ])('refuses %s, and stores and sends nothing', async (_, to, friendship) => {
    const { service, prisma, toUser } = serviceWith();
    if (friendship !== undefined) prisma.friendship.findUnique.mockResolvedValue(friendship);

    await expect(service.send(ME, to, 'salut')).rejects.toEqual(
      new ForbiddenException('message.notFriends'),
    );
    expect(prisma.friendship.findUnique).toHaveBeenCalledWith({
      where: { pairKey: pairKey(ME, to) },
      select: { status: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(toUser).not.toHaveBeenCalled();
  });

  it('stores the message and moves the conversation up in one transaction, at one instant', async () => {
    const { service, prisma } = serviceWith();
    // The time is taken when the send arrived, not after the friendship check.
    prisma.friendship.findUnique.mockImplementation(() => {
      vi.setSystemTime(new Date('2026-11-16T10:00:05Z'));
      return Promise.resolve({ status: 'accepted' });
    });

    await service.send(ME, THEM, 'salut');

    const key = pairKey(ME, THEM);
    expect(prisma.conversation.upsert).toHaveBeenCalledWith({
      where: { pairKey: key },
      create: { pairKey: key, userAId: THEM, userBId: ME, createdAt: NOW, lastMessageAt: NOW },
      update: { lastMessageAt: NOW },
    });
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: { pairKey: key, senderId: ME, text: 'salut', createdAt: NOW },
      select: { id: true, senderId: true, text: true, createdAt: true },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(['upsert', 'create']);
  });

  it('tells both rooms, each naming the other user, then the recipient what is unread', async () => {
    const { service, prisma, toUser } = serviceWith();
    prisma.message.groupBy.mockResolvedValue([{ senderId: ME, _count: { _all: 1 } }]);
    const message = { id: 'm1', senderId: ME, text: 'text m1', createdAt: NOW.toISOString() };

    await expect(service.send(ME, THEM, 'salut')).resolves.toEqual(message);
    await settle();

    expect(toUser.mock.calls).toEqual([
      [THEM, 'dm:message', { userId: ME, message }],
      [ME, 'dm:message', { userId: THEM, message }],
      [THEM, 'dm:unread', unread({ [ME]: 1 })],
    ]);
  });

  // The message is stored and delivered: the ack must not wait on the count or fail with it.
  it('answers without waiting on the unread count', async () => {
    const { service, prisma } = serviceWith();
    prisma.message.groupBy.mockReturnValue(new Promise(() => undefined));

    await expect(service.send(ME, THEM, 'salut')).resolves.toMatchObject({ id: 'm1' });
  });

  it('answers when the unread count fails, and logs it', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { service, prisma, toUser } = serviceWith();
    prisma.message.groupBy.mockRejectedValue(new Error('P1001'));

    await expect(service.send(ME, THEM, 'salut')).resolves.toMatchObject({ id: 'm1' });
    await settle();

    expect(toUser.mock.calls.map(([, event]) => event)).toEqual(['dm:message', 'dm:message']);
    expect(error).toHaveBeenCalledWith('unread count failed: Error: P1001');
    error.mockRestore();
  });

  it('refuses a send past the budget of a minute from any socket of the account, and writes nothing', async () => {
    const { service, prisma, toUser } = serviceWith();
    const gateway = new MessagesGateway(service);
    for (let n = 0; n < SEND_LIMIT_PER_MINUTE; n += 1) {
      await gateway.send(n % 2 === 0 ? one : two, { userId: THEM, text: 'salut' });
    }
    await settle();
    vi.clearAllMocks();

    await expect(gateway.send(two, { userId: THEM, text: 'salut' })).rejects.toEqual(
      new HttpException('server.rateLimited', 429),
    );
    await settle();

    expect(prisma.friendship.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(toUser).not.toHaveBeenCalled();
  });
});

describe('MessagesService read', () => {
  it('marks what they sent in the pair read, then tells every tab of the reader', async () => {
    const { service, prisma, toUser } = serviceWith();

    await service.read(ME, THEM);

    expect(prisma.message.updateMany).toHaveBeenCalledWith({
      where: { pairKey: pairKey(ME, THEM), senderId: THEM, readAt: null },
      data: { readAt: expect.any(Date) },
    });
    expect(toUser.mock.calls).toEqual([[ME, 'dm:unread', unread({})]]);
  });

  // A tab that read in a stale state still converges.
  it('answers with a snapshot when nothing was unread', async () => {
    const { service, prisma, toUser } = serviceWith();
    prisma.message.updateMany.mockResolvedValue({ count: 0 });
    prisma.message.groupBy.mockResolvedValue([{ senderId: OTHER, _count: { _all: 2 } }]);

    await service.read(ME, THEM);

    expect(toUser.mock.calls).toEqual([[ME, 'dm:unread', unread({ [OTHER]: 2 })]]);
  });

  it('refuses a read past the budget of a minute from any socket of the account, and queries nothing', async () => {
    const { service, prisma, toUser } = serviceWith();
    const gateway = new MessagesGateway(service);
    for (let n = 0; n < READ_LIMIT_PER_MINUTE; n += 1) {
      await gateway.read(n % 2 === 0 ? one : two, { userId: THEM });
    }
    vi.clearAllMocks();

    await expect(gateway.read(two, { userId: THEM })).rejects.toEqual(
      new HttpException('server.rateLimited', 429),
    );

    expect(prisma.message.updateMany).not.toHaveBeenCalled();
    expect(prisma.message.groupBy).not.toHaveBeenCalled();
    expect(toUser).not.toHaveBeenCalled();
  });
});

describe('MessagesService page', () => {
  /** n messages, newest first as the query returns them, a second apart. */
  const newestFirst = (n: number) =>
    Array.from({ length: n }, (_, i) => row(`m${n - i}`, new Date(NOW.getTime() - i * 1_000)));

  it('takes one more than a page, newest first, and returns the page oldest first', async () => {
    const { service, prisma } = serviceWith();
    const rows = newestFirst(MESSAGE_PAGE_SIZE + 1);
    prisma.message.findMany.mockResolvedValue(rows);

    const page = await service.page(ME, THEM);

    expect(prisma.message.findMany).toHaveBeenCalledWith({
      where: { pairKey: pairKey(ME, THEM) },
      select: { id: true, senderId: true, text: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MESSAGE_PAGE_SIZE + 1,
    });
    expect(page.messages).toHaveLength(MESSAGE_PAGE_SIZE);
    expect(page.messages[0].id).toBe(rows[MESSAGE_PAGE_SIZE - 1].id);
    expect(page.messages.at(-1)?.id).toBe(rows[0].id);
    // The oldest one returned: the next page ends just before it.
    expect(page.nextCursor).toBe(page.messages[0].id);
  });

  it('has no cursor once the first message is in', async () => {
    const { service, prisma } = serviceWith();
    prisma.message.findMany.mockResolvedValue(newestFirst(3));

    const page = await service.page(ME, THEM);

    expect(page.messages.map((message) => message.id)).toEqual(['m1', 'm2', 'm3']);
    expect(page.nextCursor).toBeNull();
  });

  // Two messages may share a millisecond: the id breaks the tie, as in the order.
  it('reads what comes strictly before the cursor, by time then id', async () => {
    const { service, prisma } = serviceWith();
    prisma.message.findFirst.mockResolvedValue({ id: 'm9', createdAt: NOW });

    await service.page(ME, THEM, 'm9');

    expect(prisma.message.findFirst).toHaveBeenCalledWith({
      where: { id: 'm9', pairKey: pairKey(ME, THEM) },
      select: { id: true, createdAt: true },
    });
    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          pairKey: pairKey(ME, THEM),
          OR: [{ createdAt: { lt: NOW } }, { createdAt: NOW, id: { lt: 'm9' } }],
        },
      }),
    );
  });

  it('refuses a cursor that is not a message of this pair', async () => {
    const { service, prisma } = serviceWith();

    await expect(service.page(ME, THEM, 'elsewhere')).rejects.toEqual(
      new BadRequestException('request.invalid'),
    );
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });
});

describe('MessagesService conversations', () => {
  it('names each by the other user, keeps the newest first, and counts what is unread', async () => {
    const { service, prisma } = serviceWith();
    const later = new Date('2026-11-16T11:00:00Z');
    prisma.conversation.findMany.mockResolvedValue([
      { userAId: ME, userA: person(ME), userB: person(OTHER), lastMessageAt: later },
      { userAId: THEM, userA: person(THEM), userB: person(ME), lastMessageAt: NOW },
    ]);
    prisma.message.groupBy.mockResolvedValue([{ senderId: THEM, _count: { _all: 2 } }]);

    const { conversations } = await service.conversations(ME);

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ userAId: ME }, { userBId: ME }] },
        orderBy: { lastMessageAt: 'desc' },
      }),
    );
    expect(conversations).toEqual([
      { user: person(OTHER), lastMessageAt: later.toISOString(), unread: 0 },
      { user: person(THEM), lastMessageAt: NOW.toISOString(), unread: 2 },
    ]);
  });
});
