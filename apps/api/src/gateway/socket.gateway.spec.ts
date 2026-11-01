import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Event } from 'socket.io';

import { seriesValue } from '../../test/metrics.fixtures';
import { wsConnections } from '../metrics/metrics';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import { EVENT_LIMIT, SocketGateway, fixedWindow, sameOrigin } from './socket.gateway';
import type { AppSocket, SocketServer, SocketsService } from './sockets.service';

type Screen = (packet: Event, next: (error?: Error) => void) => void;

/** A handshake as the session middleware left it. */
function fakeSocket(
  session: Record<string, unknown> | undefined,
  headers: Record<string, string> = {},
) {
  const join = vi.fn();
  const emit = vi.fn();
  let screen: Screen = () => undefined;
  const socket = {
    handshake: { headers: { host: 'localhost', ...headers } },
    request: { session, sessionID: 's1' },
    data: {},
    join,
    emit,
    use: vi.fn((fn: Screen) => (screen = fn)),
  };
  return {
    socket: socket as unknown as AppSocket,
    join,
    emit,
    screen: (packet: Event, next: (error?: Error) => void) => screen(packet, next),
  };
}

function gatewayWith(findUnique = vi.fn().mockResolvedValue({ id: 'u1' })) {
  const exists = vi.fn();
  const sockets = { closeSession: vi.fn(), attach: vi.fn() };
  const gateway = new SocketGateway(
    { user: { findUnique } } as unknown as PrismaService,
    { client: { exists } } as unknown as RedisService,
    sockets as unknown as SocketsService,
  );
  return { gateway, findUnique, exists, sockets };
}

describe('sameOrigin', () => {
  it('lets a client with no Origin through: it is not a browser', () => {
    expect(sameOrigin(undefined, 'localhost')).toBe(true);
  });

  it('accepts a page of the same host', () => {
    expect(sameOrigin('https://localhost', 'localhost')).toBe(true);
    expect(sameOrigin('http://127.0.0.1:3001', '127.0.0.1:3001')).toBe(true);
  });

  // A sibling subdomain is same-site, so the Lax cookie comes along.
  it('refuses another host, another port, and junk', () => {
    expect(sameOrigin('https://evil.vyantares.ch', 'ft.vyantares.ch')).toBe(false);
    expect(sameOrigin('http://localhost:4000', 'localhost')).toBe(false);
    expect(sameOrigin('null', 'localhost')).toBe(false);
    expect(sameOrigin('not a url', 'localhost')).toBe(false);
  });
});

describe('fixedWindow', () => {
  it('counts the events of a window and starts again after it', () => {
    let now = 1_000;
    const seen = fixedWindow(10_000, () => now);

    expect([seen(), seen(), seen()]).toEqual([1, 2, 3]);
    now += 9_999;
    expect(seen()).toBe(4);
    now += 1;
    expect(seen()).toBe(1);
  });
});

describe('SocketGateway authenticate', () => {
  it('joins the user and session rooms, then lets the socket in', async () => {
    const { gateway } = gatewayWith();
    const { socket, join } = fakeSocket({ userId: 'u1' });
    const next = vi.fn();

    await gateway.authenticate(socket, next);

    expect(socket.data).toEqual({ userId: 'u1', sessionId: 's1' });
    expect(join).toHaveBeenCalledWith(['user:u1', 'session:s1']);
    expect(next).toHaveBeenCalledWith();
    // In the room before the CONNECT ack, so an event right after connecting arrives.
    expect(join.mock.invocationCallOrder[0]).toBeLessThan(next.mock.invocationCallOrder[0]);
  });

  it('refuses a page of another origin, even with a valid session', async () => {
    const { gateway, findUnique } = gatewayWith();
    const { socket, join } = fakeSocket({ userId: 'u1' }, { origin: 'https://evil.example' });
    const next = vi.fn();

    await gateway.authenticate(socket, next);

    expect(next).toHaveBeenCalledWith(new Error('auth.sessionRequired'));
    expect(findUnique).not.toHaveBeenCalled();
    expect(join).not.toHaveBeenCalled();
  });

  it.each([
    ['no session', undefined],
    ['an anonymous session', {}],
    ['a login that still owes a second factor', { pendingUserId: 'u1' }],
  ])('refuses %s', async (_, session) => {
    const { gateway } = gatewayWith();
    const { socket, join } = fakeSocket(session);
    const next = vi.fn();

    await gateway.authenticate(socket, next);

    expect(next).toHaveBeenCalledWith(new Error('auth.sessionRequired'));
    expect(join).not.toHaveBeenCalled();
  });

  // Like AuthGuard: the session outlives a deleted account.
  it('refuses a session whose user no longer exists', async () => {
    const { gateway } = gatewayWith(vi.fn().mockResolvedValue(null));
    const next = vi.fn();

    await gateway.authenticate(fakeSocket({ userId: 'gone' }).socket, next);

    expect(next).toHaveBeenCalledWith(new Error('auth.sessionRequired'));
  });

  it('refuses with server.unexpected when the database fails', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { gateway } = gatewayWith(vi.fn().mockRejectedValue(new Error('P1001')));
    const next = vi.fn();

    await gateway.authenticate(fakeSocket({ userId: 'u1' }).socket, next);

    expect(next).toHaveBeenCalledWith(new Error('server.unexpected'));
    expect(error).toHaveBeenCalledWith('handshake failed: Error: P1001');
    error.mockRestore();
  });
});

describe('SocketGateway screen', () => {
  it('answers an unknown event with app:error and never passes an error on', () => {
    const { gateway } = gatewayWith();
    const { socket, emit, screen } = fakeSocket({ userId: 'u1' });
    gateway.handleConnection(socket);
    const next = vi.fn();

    screen(['nope', {}], next);
    screen(['constructor', 1], next);
    screen(['error', {}], next);

    expect(emit).toHaveBeenCalledTimes(3);
    expect(emit).toHaveBeenCalledWith('app:error', { code: 'request.invalid' });
    // next(err) would be re-emitted as `error`, which crashes the process.
    expect(next).not.toHaveBeenCalled();
    gateway.handleDisconnect();
  });

  it('drops a flood and says so once a window', () => {
    const { gateway } = gatewayWith();
    const { socket, emit, screen } = fakeSocket({ userId: 'u1' });
    gateway.handleConnection(socket);

    for (let i = 0; i < EVENT_LIMIT + 5; i += 1) screen(['nope', {}], vi.fn());

    const codes = emit.mock.calls.map(([, payload]) => (payload as { code: string }).code);
    expect(codes.filter((code) => code === 'request.invalid')).toHaveLength(EVENT_LIMIT);
    expect(codes.filter((code) => code === 'server.rateLimited')).toHaveLength(1);
    gateway.handleDisconnect();
  });

  it('counts the open connections', async () => {
    const { gateway } = gatewayWith();
    const before = (await seriesValue(wsConnections)) ?? 0;

    gateway.handleConnection(fakeSocket({ userId: 'u1' }).socket);
    expect(await seriesValue(wsConnections)).toBe(before + 1);
    gateway.handleDisconnect();
    expect(await seriesValue(wsConnections)).toBe(before);
  });
});

describe('SocketGateway closeEndedSessions', () => {
  let gateway: SocketGateway;

  afterEach(() => gateway.onModuleDestroy());

  /** Open sockets on these sessions, as socket.io's main namespace holds them. */
  function withSockets(sessionIds: string[]) {
    const setup = gatewayWith();
    gateway = setup.gateway;
    const open = new Map(sessionIds.map((sessionId, i) => [`id${i}`, { data: { sessionId } }]));
    const server = { use: vi.fn(), sockets: { sockets: open } };
    gateway.afterInit(server as unknown as SocketServer);
    Object.assign(gateway, { server });
    return setup;
  }

  it('closes the sessions Redis no longer has, asking once per session', async () => {
    const { exists, sockets } = withSockets(['live', 'gone', 'gone']);
    exists.mockImplementation((key: string) => Promise.resolve(key === 'sess:live' ? 1 : 0));

    await gateway.closeEndedSessions();

    expect(exists).toHaveBeenCalledTimes(2);
    expect(sockets.closeSession).toHaveBeenCalledTimes(1);
    expect(sockets.closeSession).toHaveBeenCalledWith('gone');
  });

  // Redis unreachable says nothing about the sessions.
  it('closes nothing when Redis fails', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { exists, sockets } = withSockets(['live']);
    exists.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(gateway.closeEndedSessions()).resolves.toBeUndefined();
    expect(sockets.closeSession).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('session sweep skipped: Error: ECONNREFUSED');
    warn.mockRestore();
  });
});
