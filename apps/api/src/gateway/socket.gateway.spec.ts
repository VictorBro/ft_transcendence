import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event } from 'socket.io';

import { seriesValue } from '../../test/metrics.fixtures';
import { wsConnections, wsEvents } from '../metrics/metrics';
import type { PresenceService } from '../presence/presence.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import {
  EVENT_LIMIT,
  SESSION_SOCKET_LIMIT,
  SocketGateway,
  fixedWindow,
  sameOrigin,
} from './socket.gateway';
import type { AppSocket, SocketServer, SocketsService } from './sockets.service';

type Screen = (packet: Event, next: (error?: Error) => void) => void;

const USER = 'a0000000-0000-4000-8000-000000000000';

/** A handshake as the session middleware left it. */
function fakeSocket(
  session: Record<string, unknown> | undefined,
  headers: Record<string, string> = {},
  rooms = new Map<string, Set<string>>(),
) {
  const join = vi.fn();
  const leave = vi.fn();
  const emit = vi.fn();
  let screen: Screen = () => undefined;
  const socket = {
    handshake: { headers: { host: 'localhost', ...headers } },
    request: { session, sessionID: 's1' },
    nsp: { adapter: { rooms } },
    data: {},
    join,
    leave,
    emit,
    use: vi.fn((fn: Screen) => (screen = fn)),
  };
  return {
    socket: socket as unknown as AppSocket,
    join,
    leave,
    emit,
    screen: (packet: Event, next: (error?: Error) => void) => screen(packet, next),
  };
}

/** A user last active on another day unless a test says otherwise. */
function gatewayWith(
  findUnique = vi.fn().mockResolvedValue({ lastActiveDay: new Date('2026-01-01') }),
) {
  // The session is still in Redis unless a test says otherwise.
  const exists = vi.fn().mockResolvedValue(1);
  const update = vi.fn().mockResolvedValue({});
  // No friends, no request waiting, nothing unread, and no socket ever the
  // first or the last, unless a test says otherwise.
  const findMany = vi.fn().mockResolvedValue([]);
  const count = vi.fn().mockResolvedValue(0);
  const groupBy = vi.fn().mockResolvedValue([]);
  const sockets = { closeSession: vi.fn(), attach: vi.fn(), toUser: vi.fn() };
  const presence = {
    connected: vi.fn().mockResolvedValue(false),
    disconnected: vi.fn().mockResolvedValue(false),
    isOnline: vi.fn().mockResolvedValue(new Set<string>()),
  };
  const gateway = new SocketGateway(
    {
      user: { findUnique, update },
      friendship: { findMany, count },
      message: { groupBy },
    } as unknown as PrismaService,
    { client: { exists } } as unknown as RedisService,
    sockets as unknown as SocketsService,
    presence as unknown as PresenceService,
  );
  return { gateway, findUnique, update, findMany, count, groupBy, exists, sockets, presence };
}

/** A connected socket of u1, who is friends with f1 (who asked) and f2 (who was asked). */
function connectedSocket() {
  const setup = gatewayWith();
  setup.findMany.mockResolvedValue([
    { requesterId: 'f1', addresseeId: 'u1' },
    { requesterId: 'u1', addresseeId: 'f2' },
  ]);
  const { socket, emit } = fakeSocket({ userId: 'u1' });
  socket.data = { userId: 'u1', sessionId: 's1' };
  return { ...setup, socket, emit };
}

/** Lets the work that connecting and disconnecting start run to its end. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

const unread = (counts: Record<string, number>) => ({ counts, at: expect.any(String) });
const pending = (count: number) => ({ count, at: expect.any(String) });

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

  describe('the day stamp', () => {
    // A fixed clock, so no test can straddle midnight UTC.
    const NOW = new Date('2026-11-06T12:00:00Z');
    const TODAY = new Date('2026-11-06');
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it.each([
      ['an older day', new Date('2026-01-01')],
      ['never active', null],
    ])("writes today's UTC day over %s", async (_, lastActiveDay) => {
      const { gateway, update } = gatewayWith(vi.fn().mockResolvedValue({ lastActiveDay }));
      const next = vi.fn();

      await gateway.authenticate(fakeSocket({ userId: 'u1' }).socket, next);

      expect(update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { lastActiveDay: TODAY } });
      expect(next).toHaveBeenCalledWith();
    });

    it('only reads on a later tab the same day', async () => {
      const { gateway, update } = gatewayWith(vi.fn().mockResolvedValue({ lastActiveDay: TODAY }));
      const next = vi.fn();

      await gateway.authenticate(fakeSocket({ userId: 'u1' }).socket, next);

      expect(update).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith();
    });
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

  it('refuses one socket more than a session may hold, before any query', async () => {
    const { gateway, findUnique } = gatewayWith();
    const full = new Map([
      ['session:s1', new Set(Array.from({ length: SESSION_SOCKET_LIMIT }, (_, i) => `id${i}`))],
    ]);
    const { socket, join } = fakeSocket({ userId: 'u1' }, {}, full);
    const next = vi.fn();

    await gateway.authenticate(socket, next);

    expect(next).toHaveBeenCalledWith(new Error('server.rateLimited'));
    expect(findUnique).not.toHaveBeenCalled();
    expect(join).not.toHaveBeenCalled();
  });

  // A logout that ran while this handshake was past the session middleware
  // closed the session room before the socket joined it.
  it('leaves its rooms and refuses when the session ended during the handshake', async () => {
    const { gateway, exists } = gatewayWith();
    exists.mockResolvedValue(0);
    const { socket, join, leave } = fakeSocket({ userId: 'u1' });
    const next = vi.fn();

    await gateway.authenticate(socket, next);

    expect(exists).toHaveBeenCalledWith('sess:s1');
    expect(exists.mock.invocationCallOrder[0]).toBeGreaterThan(join.mock.invocationCallOrder[0]);
    expect(leave.mock.calls).toEqual([['user:u1'], ['session:s1']]);
    expect(next).toHaveBeenCalledWith(new Error('auth.sessionRequired'));
  });

  // Like AuthGuard: the session outlives a deleted account.
  it('refuses a session whose user no longer exists', async () => {
    const { gateway, update } = gatewayWith(vi.fn().mockResolvedValue(null));
    const next = vi.fn();

    await gateway.authenticate(fakeSocket({ userId: 'gone' }).socket, next);

    expect(next).toHaveBeenCalledWith(new Error('auth.sessionRequired'));
    expect(update).not.toHaveBeenCalled();
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
    gateway.handleDisconnect(socket);
  });

  it('drops a flood and says so once a window', () => {
    const { gateway } = gatewayWith();
    const { socket, emit, screen } = fakeSocket({ userId: 'u1' });
    gateway.handleConnection(socket);

    for (let i = 0; i < EVENT_LIMIT + 5; i += 1) screen(['nope', {}], vi.fn());

    const codes = emit.mock.calls.map(([, payload]) => (payload as { code: string }).code);
    expect(codes.filter((code) => code === 'request.invalid')).toHaveLength(EVENT_LIMIT);
    expect(codes.filter((code) => code === 'server.rateLimited')).toHaveLength(1);
    gateway.handleDisconnect(socket);
  });

  // A read goes out for each message received: it must not use up the sends.
  it('keeps a window per event, unknown names sharing one, each told once', () => {
    const { gateway } = gatewayWith();
    const { socket, emit, screen } = fakeSocket({ userId: 'u1' });
    gateway.handleConnection(socket);
    const next = vi.fn();
    const ack = vi.fn();

    for (let i = 0; i < EVENT_LIMIT + 5; i += 1) {
      screen(['dm:read', { userId: USER }], next);
      screen([`nope${i}`, {}], next);
    }
    screen(['dm:send', { userId: USER, text: 'salut' }, ack], next);

    const codes = emit.mock.calls.map(([, payload]) => (payload as { code: string }).code);
    expect(codes.filter((code) => code === 'request.invalid')).toHaveLength(EVENT_LIMIT);
    expect(codes.filter((code) => code === 'server.rateLimited')).toHaveLength(2);
    // Every read of the window, then the send.
    expect(next).toHaveBeenCalledTimes(EVENT_LIMIT + 1);
    expect(ack).not.toHaveBeenCalled();
    gateway.handleDisconnect(socket);
  });

  it('passes the parsed payload on, the ack still last', () => {
    const { gateway } = gatewayWith();
    const { socket, screen } = fakeSocket({ userId: 'u1' });
    gateway.handleConnection(socket);
    const next = vi.fn();
    const ack = vi.fn();
    const packet: Event = ['dm:send', { userId: USER.toUpperCase(), text: ' salut ' }, ack];

    screen(packet, next);

    expect(packet).toEqual(['dm:send', { userId: USER, text: 'salut' }, ack]);
    expect(next).toHaveBeenCalledWith();
    expect(ack).not.toHaveBeenCalled();
    gateway.handleDisconnect(socket);
  });

  // Nest would hand the handler [payload, extra] in place of the payload.
  it('refuses anything but one payload, with or without an ack', () => {
    const { gateway } = gatewayWith();
    const { socket, emit, screen } = fakeSocket({ userId: 'u1' });
    gateway.handleConnection(socket);
    const next = vi.fn();
    const ack = vi.fn();

    screen(['dm:read', { userId: USER }, 'extra'], next);
    screen(['dm:read'], next);
    screen(['dm:read', { userId: USER }, 'extra', ack], next);

    expect(emit.mock.calls).toEqual([
      ['app:error', { code: 'request.invalid' }],
      ['app:error', { code: 'request.invalid' }],
    ]);
    expect(ack).toHaveBeenCalledExactlyOnceWith({ ok: false, code: 'request.invalid' });
    expect(next).not.toHaveBeenCalled();
    gateway.handleDisconnect(socket);
  });

  describe('an event sent with an ack', () => {
    it('gets its ack answered, and no app:error, when unknown or invalid', () => {
      const { gateway } = gatewayWith();
      const { socket, emit, screen } = fakeSocket({ userId: 'u1' });
      gateway.handleConnection(socket);
      const next = vi.fn();
      const acks = [vi.fn(), vi.fn(), vi.fn()];

      screen(['nope', {}, acks[0]], next);
      screen(['dm:send', { userId: 'nope', text: 'salut' }, acks[1]], next);
      screen(['dm:send', { userId: USER, text: ' ' }, acks[2]], next);

      expect(acks.map((ack) => ack.mock.calls)).toEqual([
        [[{ ok: false, code: 'request.invalid' }]],
        [[{ ok: false, code: 'request.invalid' }]],
        // The rule's own code, as CodeValidationPipe answers a body.
        [[{ ok: false, code: 'message.empty' }]],
      ]);
      expect(emit).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
      gateway.handleDisconnect(socket);
    });

    // The caller is waiting on it: only events without one are told once a window.
    it('gets its ack answered every time it is over the limit', () => {
      const { gateway } = gatewayWith();
      const { socket, emit, screen } = fakeSocket({ userId: 'u1' });
      gateway.handleConnection(socket);
      const next = vi.fn();
      const acks = [vi.fn(), vi.fn()];

      for (let i = 0; i < EVENT_LIMIT; i += 1) {
        screen(['dm:send', { userId: USER, text: 'salut' }, vi.fn()], next);
      }
      for (const ack of acks) screen(['dm:send', { userId: USER, text: 'salut' }, ack], next);

      expect(acks.map((ack) => ack.mock.calls)).toEqual([
        [[{ ok: false, code: 'server.rateLimited' }]],
        [[{ ok: false, code: 'server.rateLimited' }]],
      ]);
      expect(emit).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(EVENT_LIMIT);
      gateway.handleDisconnect(socket);
    });

    it('gets its ack answered server.unexpected when screening throws', () => {
      const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { gateway } = gatewayWith();
      const { socket, emit, screen } = fakeSocket({ userId: 'u1' });
      gateway.handleConnection(socket);
      const ack = vi.fn();
      const hostile = new Proxy(
        {},
        {
          get: () => {
            throw new Error('boom');
          },
        },
      );

      screen(['dm:read', hostile, ack], vi.fn());

      expect(ack).toHaveBeenCalledExactlyOnceWith({ ok: false, code: 'server.unexpected' });
      expect(emit).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith('event dm:read failed: Error: boom');
      error.mockRestore();
      gateway.handleDisconnect(socket);
    });
  });

  it('counts the open connections', async () => {
    const { gateway } = gatewayWith();
    const { socket } = fakeSocket({ userId: 'u1' });
    const before = (await seriesValue(wsConnections)) ?? 0;

    gateway.handleConnection(socket);
    expect(await seriesValue(wsConnections)).toBe(before + 1);
    gateway.handleDisconnect(socket);
    expect(await seriesValue(wsConnections)).toBe(before);
  });
});

describe('SocketGateway presence', () => {
  const update = (userId: string, status: string) => ({ userId, status, at: expect.any(String) });

  it("tells the friends' rooms when the first socket opens", async () => {
    const { gateway, socket, presence, sockets } = connectedSocket();
    presence.connected.mockResolvedValue(true);

    gateway.handleConnection(socket);
    await settle();

    expect(presence.connected).toHaveBeenCalledWith('u1');
    expect(sockets.toUser.mock.calls).toEqual([
      ['f1', 'presence:update', update('u1', 'online')],
      ['f2', 'presence:update', update('u1', 'online')],
    ]);
  });

  it('tells nobody when another tab is already open', async () => {
    const { gateway, socket, sockets } = connectedSocket();

    gateway.handleConnection(socket);
    await settle();

    expect(sockets.toUser).not.toHaveBeenCalled();
  });

  // The page was rendered a moment before: a friend may have come or gone since.
  it('tells the new socket, and only it, where each friend stands', async () => {
    const { gateway, socket, emit, presence, sockets } = connectedSocket();
    presence.isOnline.mockResolvedValue(new Set(['f2']));

    gateway.handleConnection(socket);
    await settle();

    expect(presence.isOnline).toHaveBeenCalledWith(['f1', 'f2']);
    expect(emit.mock.calls).toEqual([
      ['presence:update', update('f1', 'offline')],
      ['presence:update', update('f2', 'online')],
      ['friend:pending', pending(0)],
      ['dm:unread', unread({})],
    ]);
    expect(sockets.toUser).not.toHaveBeenCalled();
  });

  it('tells the friends once the last socket has stayed closed', async () => {
    const { gateway, socket, presence, sockets, findMany } = connectedSocket();
    presence.disconnected.mockResolvedValue(true);

    gateway.handleDisconnect(socket);
    await settle();

    expect(presence.disconnected).toHaveBeenCalledWith('u1');
    // Asked when leaving, not on connect: a friendship may have changed since.
    expect(findMany).toHaveBeenCalledOnce();
    expect(sockets.toUser.mock.calls).toEqual([
      ['f1', 'presence:update', update('u1', 'offline')],
      ['f2', 'presence:update', update('u1', 'offline')],
    ]);
  });

  // A reload: a tab came back within the grace period.
  it('tells nobody, and looks up no friend, when a tab came back', async () => {
    const { gateway, socket, sockets, findMany } = connectedSocket();

    gateway.handleDisconnect(socket);
    await settle();

    expect(findMany).not.toHaveBeenCalled();
    expect(sockets.toUser).not.toHaveBeenCalled();
  });

  // Unhandled, a rejection in work nobody awaits would take the process down.
  it('logs a Redis failure on either side and carries on', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { gateway, socket, emit, presence } = connectedSocket();
    presence.connected.mockRejectedValue(new Error('ECONNREFUSED'));
    presence.disconnected.mockRejectedValue(new Error('ECONNREFUSED'));

    gateway.handleConnection(socket);
    gateway.handleDisconnect(socket);
    await settle();

    expect(error).toHaveBeenCalledWith('presence on connect failed: Error: ECONNREFUSED');
    expect(error).toHaveBeenCalledWith('presence on disconnect failed: Error: ECONNREFUSED');
    // The counts settle on their own.
    expect(emit.mock.calls).toEqual([
      ['friend:pending', pending(0)],
      ['dm:unread', unread({})],
    ]);
    error.mockRestore();
  });
});

describe('SocketGateway unread on connect', () => {
  const out = { direction: 'out', event: 'dm:unread', outcome: 'ok' };

  // The page was rendered a moment before: a message may have arrived since.
  it('tells the new socket, and only it, what is unread, after where each friend stands', async () => {
    const { gateway, socket, emit, groupBy, sockets } = connectedSocket();
    groupBy.mockResolvedValue([{ senderId: 'f1', _count: { _all: 3 } }]);
    const before = (await seriesValue(wsEvents, out)) ?? 0;

    gateway.handleConnection(socket);
    await settle();

    expect(emit.mock.calls.map(([event]) => event)).toEqual([
      'presence:update',
      'presence:update',
      'friend:pending',
      'dm:unread',
    ]);
    expect(emit).toHaveBeenLastCalledWith('dm:unread', unread({ f1: 3 }));
    expect(sockets.toUser).not.toHaveBeenCalled();
    expect(await seriesValue(wsEvents, out)).toBe(before + 1);
  });

  // The tab must know it has heard, or it would wait for a first count.
  it('sends it with nothing unread too', async () => {
    const { gateway } = gatewayWith();
    const { socket, emit } = fakeSocket({ userId: 'u1' });
    socket.data = { userId: 'u1', sessionId: 's1' };

    gateway.handleConnection(socket);
    await settle();

    expect(emit.mock.calls).toEqual([
      ['friend:pending', pending(0)],
      ['dm:unread', unread({})],
    ]);
  });

  // The friends still hear this user came online, and the socket where each stands.
  it('logs a failed count and carries on', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { gateway, socket, emit, groupBy, presence, sockets } = connectedSocket();
    groupBy.mockRejectedValue(new Error('P1001'));
    presence.connected.mockResolvedValue(true);

    gateway.handleConnection(socket);
    await settle();

    const online = { userId: 'u1', status: 'online', at: expect.any(String) };
    expect(sockets.toUser.mock.calls).toEqual([
      ['f1', 'presence:update', online],
      ['f2', 'presence:update', online],
    ]);
    expect(emit.mock.calls.map(([event]) => event)).toEqual([
      'presence:update',
      'presence:update',
      'friend:pending',
    ]);
    expect(error).toHaveBeenCalledWith('unread on connect failed: Error: P1001');
    error.mockRestore();
  });
});

describe('SocketGateway pending requests on connect', () => {
  const out = { direction: 'out', event: 'friend:pending', outcome: 'ok' };

  // The header was rendered a moment before: a request may have arrived since.
  it('tells the new socket, and only it, how many requests wait, before what is unread', async () => {
    const { gateway, socket, emit, count, sockets } = connectedSocket();
    count.mockResolvedValue(2);
    const before = (await seriesValue(wsEvents, out)) ?? 0;

    gateway.handleConnection(socket);
    await settle();

    expect(count).toHaveBeenCalledExactlyOnceWith({
      where: { addresseeId: 'u1', status: 'pending' },
    });
    expect(emit.mock.calls.slice(-2)).toEqual([
      ['friend:pending', pending(2)],
      ['dm:unread', unread({})],
    ]);
    expect(sockets.toUser).not.toHaveBeenCalled();
    expect(await seriesValue(wsEvents, out)).toBe(before + 1);
  });

  // The friends still hear this user came online, and the socket the rest.
  it('logs a failed count and carries on', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { gateway, socket, emit, count, presence, sockets } = connectedSocket();
    count.mockRejectedValue(new Error('P1001'));
    presence.connected.mockResolvedValue(true);

    gateway.handleConnection(socket);
    await settle();

    expect(sockets.toUser.mock.calls.map(([, event]) => event)).toEqual([
      'presence:update',
      'presence:update',
    ]);
    expect(emit.mock.calls.map(([event]) => event)).toEqual([
      'presence:update',
      'presence:update',
      'dm:unread',
    ]);
    expect(error).toHaveBeenCalledWith('pending on connect failed: Error: P1001');
    error.mockRestore();
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
