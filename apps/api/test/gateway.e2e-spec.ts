import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import * as OTPAuth from 'otpauth';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppError, CourseUpdated } from '@ft/shared';

import { AppModule } from '../src/app.module';
import { configureApp, SESSION_KEY_PREFIX } from '../src/app.setup';
import { SocketGateway } from '../src/gateway/socket.gateway';
import { SocketsService } from '../src/gateway/sockets.service';
import { wsConnections, wsEvents } from '../src/metrics/metrics';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { seriesValue } from './metrics.fixtures';
import {
  type ClientSocket,
  collect,
  connect,
  connected,
  nextEvent,
  refusal,
  sessionCookie,
} from './socket.fixtures';

/**
 * The gateway only exists once express-session, the store, socket.io and the
 * guards' absence meet on a real http server, so it is proven here with real
 * sockets. Needs a real Postgres and Redis, which CI provides as services.
 */
describe('gateway (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let port: number;

  const stamp = Date.now();
  const password = 'Correct-Horse-9';
  const emailA = `ws-a-${stamp}@example.com`;
  const emailB = `ws-b-${stamp}@example.com`;
  const email2fa = `ws-totp-${stamp}@example.com`;
  let userA = '';
  let agentA: TestAgent;
  let agentB: TestAgent;
  let cookieA = '';
  let cookieB = '';

  /**
   * Signup and login are throttled per address, and this suite signs in more
   * often than one address may. Each agent claims its own TEST-NET-1 address,
   * clear of the ranges the other suites use.
   */
  let addresses = 0;
  const agentFrom = () => {
    addresses += 1;
    return request.agent(app.getHttpServer()).set('X-Forwarded-For', `192.0.2.${addresses}`);
  };

  const signUp = async (email: string, name: string) => {
    const agent = agentFrom();
    const res = await agent
      .post('/api/auth/signup')
      .send({ email, displayName: name, password })
      .expect(201);
    return { agent, cookie: sessionCookie(res), id: res.body.id as string };
  };

  const logIn = async (email: string) => {
    const agent = agentFrom();
    const res = await agent.post('/api/auth/login').send({ email, password }).expect(200);
    return { agent, cookie: sessionCookie(res) };
  };

  /** A placed French course, so both the goal and the level can be changed. */
  const placeFrench = async (agent: TestAgent) => {
    await agent.post('/api/courses').send({ lang: 'fr', dailyGoal: 30 }).expect(201);
    await agent.patch('/api/courses/fr/level').send({ level: 'B1' }).expect(200);
  };

  /** The session id inside a signed `ft.sid=s%3A<id>.<signature>` cookie. */
  const sessionIdOf = (cookie: string) =>
    decodeURIComponent(cookie.split('=')[1]).slice('s:'.length).split('.')[0];

  const opened: ClientSocket[] = [];
  const open = (cookie?: string, headers?: Record<string, string>) => {
    const socket = connect(port, cookie, headers);
    opened.push(socket);
    return socket;
  };

  /**
   * A close the server sent `socket` goes out before this event, which it then
   * never gets. Reading `connected` alone would win the race against that close.
   */
  const stillOpen = async (socket: ClientSocket) => {
    const barrier = nextEvent(socket, 'course:updated');
    app.get(SocketsService).toUser(userA, 'course:updated', { lang: 'fr' });
    await barrier;
    expect(socket.connected).toBe(true);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    // A real port, not init(): socket.io needs a listening server to dial.
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as AddressInfo).port;
    prisma = app.get(PrismaService);

    const a = await signUp(emailA, `wsa${stamp}`);
    const b = await signUp(emailB, `wsb${stamp}`);
    ({ agent: agentA, cookie: cookieA, id: userA } = a);
    ({ agent: agentB, cookie: cookieB } = b);
    await placeFrench(agentA);
    await placeFrench(agentB);
  });

  // Until the server has seen every close, so each test starts with no socket open.
  afterEach(async () => {
    for (const socket of opened.splice(0)) socket.close();
    await vi.waitFor(async () => expect(await seriesValue(wsConnections)).toBe(0));
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB, email2fa] } } });
    await app.close();
  });

  describe('the handshake', () => {
    it('refuses a socket without a session', async () => {
      const before = await seriesValue(wsConnections);

      expect(await refusal(open())).toBe('auth.sessionRequired');
      expect(await seriesValue(wsConnections)).toBe(before);
    });

    it('refuses a forged cookie', async () => {
      expect(await refusal(open('ft.sid=s%3Aforged.sig'))).toBe('auth.sessionRequired');
    });

    // Same-site is not same-origin: a sibling subdomain's page carries the Lax cookie.
    it('refuses a page of another origin, and lets our own in', async () => {
      const foreign = open(cookieA, { origin: 'https://evil.example' });
      expect(await refusal(foreign)).toBe('auth.sessionRequired');

      await connected(open(cookieA, { origin: `http://127.0.0.1:${port}` }));
    });

    it('counts an open connection, and stops counting it once closed', async () => {
      const before = (await seriesValue(wsConnections)) ?? 0;

      const socket = await connected(open(cookieA));
      await vi.waitFor(async () => expect(await seriesValue(wsConnections)).toBe(before + 1));

      socket.close();
      await vi.waitFor(async () => expect(await seriesValue(wsConnections)).toBe(before));
    });
  });

  describe('the session ending', () => {
    it("closes the session's sockets on logout, not the other session's", async () => {
      const first = await logIn(emailA);
      const second = await logIn(emailA);
      const mine = await connected(open(first.cookie));
      const other = await connected(open(second.cookie));
      const closed = nextEvent<string>(mine, 'disconnect');

      await first.agent.post('/api/auth/logout').expect(204);

      expect(await closed).toBe('io server disconnect');
      await stillOpen(other);
      expect(await refusal(open(first.cookie))).toBe('auth.sessionRequired');
    });

    // A tab signed in again (as anyone) must not keep a socket in the old room.
    it("logging in again closes the replaced session's sockets", async () => {
      const { agent, cookie } = await logIn(emailA);
      const old = await connected(open(cookie));
      const closed = nextEvent<string>(old, 'disconnect');

      const again = await agent.post('/api/auth/login').send({ email: emailA, password });

      expect(again.status).toBe(200);
      expect(await closed).toBe('io server disconnect');
      await connected(open(sessionCookie(again)));
    });

    // Redis expires an idle session silently; the sweep is what notices.
    it('closes sockets whose session expired', async () => {
      const ending = await logIn(emailA);
      const gone = await connected(open(ending.cookie));
      const live = await connected(open(cookieA));
      const closed = nextEvent<string>(gone, 'disconnect');

      await app.get(RedisService).client.del(`${SESSION_KEY_PREFIX}${sessionIdOf(ending.cookie)}`);
      await app.get(SocketGateway).closeEndedSessions();

      expect(await closed).toBe('io server disconnect');
      await stillOpen(live);
    });

    it('a 2FA change replaces the session and its sockets', async () => {
      const { agent, cookie } = await signUp(email2fa, `wstotp${stamp}`);
      const old = await connected(open(cookie));
      const closed = nextEvent<string>(old, 'disconnect');

      const setup = await agent.post('/api/auth/2fa/setup').expect(200);
      const code = new OTPAuth.TOTP({
        issuer: 'ft_transcendence',
        label: email2fa,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(setup.body.secret),
      }).generate();
      const enabled = await agent.post('/api/auth/2fa/enable').send({ code }).expect(200);

      expect(enabled.body.recoveryCodes).toHaveLength(10);
      expect(await closed).toBe('io server disconnect');
      await connected(open(sessionCookie(enabled)));
      expect(await refusal(open(cookie))).toBe('auth.sessionRequired');
    });
  });

  describe('course:updated', () => {
    it("a goal change reaches the user's sockets and nobody else's", async () => {
      const tabs = await Promise.all([connected(open(cookieA)), connected(open(cookieA))]);
      const stranger = await connected(open(cookieB));
      const strangerSaw = collect<CourseUpdated>(stranger, 'course:updated');
      const arrived = tabs.map((tab) => nextEvent<CourseUpdated>(tab, 'course:updated'));

      await agentA.patch('/api/courses/fr').send({ dailyGoal: 60 }).expect(200);

      expect(await Promise.all(arrived)).toEqual([{ lang: 'fr' }, { lang: 'fr' }]);
      // A barrier: B's own event comes after anything sent to B before it.
      const own = nextEvent<CourseUpdated>(stranger, 'course:updated');
      await agentB.patch('/api/courses/fr').send({ dailyGoal: 10 }).expect(200);
      await own;
      expect(strangerSaw).toEqual([{ lang: 'fr' }]);
    });

    it('a level change emits; a 404 does not', async () => {
      const tab = await connected(open(cookieA));
      const seen = collect<CourseUpdated>(tab, 'course:updated');

      await agentA.patch('/api/courses/de/level').send({ level: 'A2' }).expect(404);
      const arrived = nextEvent<CourseUpdated>(tab, 'course:updated');
      await agentA.patch('/api/courses/fr/level').send({ level: 'B2' }).expect(200);
      await arrived;

      expect(seen).toEqual([{ lang: 'fr' }]);
    });
  });

  describe('client events', () => {
    it('answers an unknown event with app:error and stays connected', async () => {
      const socket = await connected(open(cookieA));
      const replies = collect<AppError>(socket, 'app:error');
      const invalid = { direction: 'in', event: 'unknown', outcome: 'invalid' };
      const before = (await seriesValue(wsEvents, invalid)) ?? 0;

      socket.emit('nope', {});
      socket.emit('constructor', 1);
      // Re-emitted as an `error` on the server socket, this would crash the process.
      socket.emit('error', {});

      await vi.waitFor(() => expect(replies).toHaveLength(3));
      expect(replies).toEqual(Array(3).fill({ code: 'request.invalid' }));
      expect(socket.connected).toBe(true);
      expect(await seriesValue(wsEvents, invalid)).toBe(before + 3);
      await request(app.getHttpServer()).get('/api/health').expect(200);
    });

    it('limits each socket, and says so once', async () => {
      const socket = await connected(open(cookieA));
      const replies = collect<AppError>(socket, 'app:error');
      const limited = { direction: 'in', event: 'unknown', outcome: 'rate_limited' };
      const before = (await seriesValue(wsEvents, limited)) ?? 0;

      for (let i = 0; i < 25; i += 1) socket.emit('nope', {});

      // All 25 screened; then an event sent after every reply is the barrier.
      await vi.waitFor(async () => expect(await seriesValue(wsEvents, limited)).toBe(before + 5));
      const barrier = nextEvent(socket, 'course:updated');
      app.get(SocketsService).toUser(userA, 'course:updated', { lang: 'fr' });
      await barrier;

      const codes = replies.map(({ code }) => code);
      expect(codes.filter((code) => code === 'request.invalid')).toHaveLength(20);
      expect(codes.filter((code) => code === 'server.rateLimited')).toHaveLength(1);
      expect(codes).toHaveLength(21);

      // The limit is per socket: the user's next tab starts with a fresh window.
      const fresh = await connected(open(cookieA));
      const answer = nextEvent<AppError>(fresh, 'app:error');
      fresh.emit('nope', {});
      expect(await answer).toEqual({ code: 'request.invalid' });
    });
  });
});
