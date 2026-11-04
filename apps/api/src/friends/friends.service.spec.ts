import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { SocketsService } from '../gateway/sockets.service';
import type { PrismaService } from '../prisma/prisma.service';
import { FriendsService } from './friends.service';
import { pairKey } from './pair';

/**
 * What Supertest cannot force: an insert that loses the race to a crossing
 * request, and one that names an account deleted in between.
 */

const ME = 'b0000000-0000-4000-8000-000000000000';
const THEM = 'a0000000-0000-4000-8000-000000000000';
const OTHER = 'c0000000-0000-4000-8000-000000000000';

const prismaError = (code: string) => Object.assign(new Error(code), { code });
const person = (id: string) => ({ id, displayName: `user-${id[0]}`, avatarUrl: null });

function serviceWith(friendship: Record<string, unknown>, sockets = { toUser: vi.fn() }) {
  const service = new FriendsService(
    { friendship } as unknown as PrismaService,
    sockets as unknown as SocketsService,
  );
  return { service, toUser: sockets.toUser };
}

describe('pairKey', () => {
  it('is the same both ways, smaller id first', () => {
    expect(pairKey(ME, THEM)).toBe(pairKey(THEM, ME));
    expect(pairKey(ME, THEM)).toBe(`${THEM}:${ME}`);
  });
});

describe('FriendsService send', () => {
  it('refuses yourself before asking the database', async () => {
    const findUnique = vi.fn();
    const { service } = serviceWith({ findUnique });

    await expect(service.send(ME, ME)).rejects.toEqual(new BadRequestException('friend.self'));
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('creates a request under the pair key and tells both users', async () => {
    const create = vi.fn().mockResolvedValue({});
    const { service, toUser } = serviceWith({
      findUnique: vi.fn().mockResolvedValue(null),
      create,
    });

    await expect(service.send(ME, THEM)).resolves.toEqual({ status: 'pending' });
    expect(create).toHaveBeenCalledWith({
      data: { pairKey: pairKey(ME, THEM), requesterId: ME, addresseeId: THEM },
    });
    expect(toUser.mock.calls).toEqual([
      [THEM, 'friend:request', { userId: ME }],
      [ME, 'friend:request', { userId: THEM }],
    ]);
  });

  it('accepts their request when it got in first, after our insert lost', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ status: 'pending', requesterId: THEM });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const { service, toUser } = serviceWith({
      findUnique,
      create: vi.fn().mockRejectedValue(prismaError('P2002')),
      updateMany,
    });

    await expect(service.send(ME, THEM)).resolves.toEqual({ status: 'accepted' });
    expect(updateMany).toHaveBeenCalledWith({
      where: { pairKey: pairKey(ME, THEM), requesterId: THEM, status: 'pending' },
      data: { status: 'accepted' },
    });
    expect(toUser.mock.calls).toEqual([
      [THEM, 'friend:accepted', { userId: ME }],
      [ME, 'friend:accepted', { userId: THEM }],
    ]);
  });

  it('answers 404 for an account that is gone, and tells nobody', async () => {
    const { service, toUser } = serviceWith({
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockRejectedValue(prismaError('P2003')),
    });

    await expect(service.send(ME, THEM)).rejects.toEqual(new NotFoundException('user.notFound'));
    expect(toUser).not.toHaveBeenCalled();
  });
});

describe('FriendsService writes that find nothing', () => {
  const nothing = { count: 0 };

  it.each([
    ['accept', 'friend.requestNotFound'],
    ['deleteRequest', 'friend.requestNotFound'],
    ['remove', 'friend.notFound'],
  ] as const)('%s answers 404 %s and tells nobody', async (method, code) => {
    const { service, toUser } = serviceWith({
      updateMany: vi.fn().mockResolvedValue(nothing),
      deleteMany: vi.fn().mockResolvedValue(nothing),
    });

    await expect(service[method](ME, THEM)).rejects.toEqual(new NotFoundException(code));
    expect(toUser).not.toHaveBeenCalled();
  });

  // The status in the condition is what keeps the requests route from unfriending.
  it('deletes only a row in the state the route is about', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const { service, toUser } = serviceWith({ deleteMany });

    await service.deleteRequest(ME, THEM);
    await service.remove(ME, THEM);

    expect(deleteMany.mock.calls).toEqual([
      [{ where: { pairKey: pairKey(ME, THEM), status: 'pending' } }],
      [{ where: { pairKey: pairKey(ME, THEM), status: 'accepted' } }],
    ]);
    expect(toUser).toHaveBeenCalledWith(THEM, 'friend:removed', { userId: ME });
  });
});

describe('FriendsService list', () => {
  it('sorts each row into friends, received or sent, from your side', async () => {
    const row = (status: string, requesterId: string, addresseeId: string) => ({
      status,
      requesterId,
      requester: person(requesterId),
      addressee: person(addresseeId),
    });
    const { service } = serviceWith({
      findMany: vi
        .fn()
        .mockResolvedValue([
          row('accepted', THEM, ME),
          row('pending', OTHER, ME),
          row('pending', ME, THEM),
        ]),
    });

    await expect(service.list(ME)).resolves.toEqual({
      friends: [person(THEM)],
      received: [person(OTHER)],
      sent: [person(THEM)],
    });
  });
});
