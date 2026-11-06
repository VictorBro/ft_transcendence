import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { RECENTLY_ACTIVE_LIMIT, USER_SEARCH_LIMIT, type FriendEvent } from '@ft/shared';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { wsConnections } from '../src/metrics/metrics';
import { PrismaService } from '../src/prisma/prisma.service';
import { seriesValue } from './metrics.fixtures';
import { type ClientSocket, connect, connected, nextEvent, sessionCookie } from './socket.fixtures';

type Account = { agent: TestAgent; cookie: string; id: string; name: string };

/**
 * Every route behind the guard and the id pipe, on a listening server so the
 * events can be read off real sockets. Needs a real Postgres and Redis, which
 * CI provides as services.
 */
describe('friends (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let port: number;

  const stamp = Date.now();
  const password = 'Correct-Horse-9';
  const emailOf = (label: string) => `friends-${label}-${stamp}@example.com`;
  /** The limit rows, written straight to the database: no signup to wait on. */
  const crowd = `frcrowd${stamp}`;

  // A's name holds a `_`, B's the same with an `x` there: a search for A that
  // finds B treated `_` as a wildcard. C is the stranger to the A and B flow.
  let a: Account;
  let b: Account;
  let c: Account;
  let d: Account;
  let e: Account;
  let f: Account;
  let g: Account;
  // The recently active: their own people, so no other test's rows get in the way.
  let h: Account;
  let i: Account;
  let j: Account;

  /** Each agent its own TEST-NET-1 address, so signups never meet their limit. */
  let addresses = 0;
  const agentFrom = () => {
    addresses += 1;
    return request.agent(app.getHttpServer()).set('X-Forwarded-For', `192.0.2.${addresses}`);
  };

  const signUp = async (label: string, name: string): Promise<Account> => {
    const agent = agentFrom();
    const res = await agent
      .post('/api/auth/signup')
      .send({ email: emailOf(label), displayName: name, password })
      .expect(201);
    return { agent, cookie: sessionCookie(res), id: res.body.id as string, name };
  };

  const opened: ClientSocket[] = [];
  const tab = (account: Account) => {
    const socket = connect(port, account.cookie);
    opened.push(socket);
    return connected(socket);
  };

  /** Every event the socket gets from now on, in order: what it missed is as telling. */
  const heard = (socket: ClientSocket) => {
    const seen: [string, FriendEvent][] = [];
    socket.onAny((event: string, payload: FriendEvent) => seen.push([event, payload]));
    return seen;
  };

  const friendsOf = async (account: Account) =>
    (await account.agent.get('/api/friends').expect(200)).body;
  const recentIds = async (account: Account) =>
    (await account.agent.get('/api/users/recently-active').expect(200)).body.users.map(
      (user: { id: string }) => user.id,
    );
  const rowsNaming = (id: string) =>
    prisma.friendship.findMany({ where: { OR: [{ requesterId: id }, { addresseeId: id }] } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    // A real port, not init(): socket.io needs a listening server to dial.
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as AddressInfo).port;
    prisma = app.get(PrismaService);

    a = await signUp('a', `fr_a${stamp}`);
    b = await signUp('b', `frxa${stamp}`);
    c = await signUp('c', `Frc${stamp}`);
    d = await signUp('d', `frd${stamp}`);
    e = await signUp('e', `fre${stamp}`);
    f = await signUp('f', `frf${stamp}`);
    g = await signUp('g', `frg${stamp}`);
    h = await signUp('h', `frh${stamp}`);
    i = await signUp('i', `fri${stamp}`);
    j = await signUp('j', `frj${stamp}`);
  });

  // Until the server has seen every close, so each test starts with no socket open.
  afterEach(async () => {
    for (const socket of opened.splice(0)) socket.close();
    await vi.waitFor(async () => expect(await seriesValue(wsConnections)).toBe(0));
  });

  afterAll(async () => {
    // Friendship cascades on either user, so the rows go with them.
    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: { in: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map(emailOf) } },
          { displayName: { startsWith: crowd } },
        ],
      },
    });
    await app.close();
  });

  it('refuses every route without a session', async () => {
    const server = request(app.getHttpServer());
    const someone = randomUUID();

    const responses = await Promise.all([
      server.get('/api/users').query({ q: 'abc' }),
      server.get('/api/users/recently-active'),
      server.get(`/api/users/${someone}`),
      server.get('/api/friends'),
      server.post(`/api/friends/requests/${someone}`),
      server.post(`/api/friends/requests/${someone}/accept`),
      server.delete(`/api/friends/requests/${someone}`),
      server.delete(`/api/friends/${someone}`),
    ]);

    for (const res of responses) {
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('auth.sessionRequired');
    }
  });

  describe('search', () => {
    it('matches part of a name in any case, with `_` meaning itself', async () => {
      const res = await c.agent
        .get('/api/users')
        .query({ q: `FR_A${stamp}` })
        .expect(200);

      expect(res.body).toEqual({ users: [{ id: a.id, displayName: a.name, avatarUrl: null }] });
      // What /privacy says others see, and nothing more.
      expect(Object.keys(res.body.users[0]).sort()).toEqual(['avatarUrl', 'displayName', 'id']);
    });

    it('never finds yourself', async () => {
      const res = await c.agent.get('/api/users').query({ q: c.name }).expect(200);

      expect(res.body).toEqual({ users: [] });
    });

    it(`stops at ${USER_SEARCH_LIMIT}, in display name order`, async () => {
      const names = Array.from(
        { length: USER_SEARCH_LIMIT + 1 },
        (_, i) => `${crowd}-${String(i).padStart(2, '0')}`,
      );
      await prisma.user.createMany({
        data: names.map((displayName) => ({
          email: `${displayName}@example.com`,
          displayName,
          passwordHash: 'unused',
        })),
      });

      const res = await c.agent.get('/api/users').query({ q: crowd }).expect(200);

      expect(res.body.users.map((user: { displayName: string }) => user.displayName)).toEqual(
        names.slice(0, USER_SEARCH_LIMIT),
      );
    });

    it.each([
      ['too short', 'ab', 'displayName.tooShort'],
      ['a wildcard', 'a%b', 'displayName.invalidCharacters'],
      ['missing', undefined, 'displayName.tooShort'],
    ])('answers 400 for a query %s', async (_case, q, code) => {
      const res = await c.agent
        .get('/api/users')
        .query(q === undefined ? {} : { q })
        .expect(400);

      expect(res.body.message).toEqual([code]);
    });
  });

  describe('recently active', () => {
    it('lists whoever opened a tab last first, never you', async () => {
      await prisma.userLevel.createMany({
        data: [
          { userId: i.id, lang: 'fr', dailyGoal: 10, createdAt: new Date('2026-01-01') },
          { userId: i.id, lang: 'de', dailyGoal: 10, createdAt: new Date('2026-01-02') },
        ],
      });
      await tab(h);
      await tab(i);

      const res = await j.agent.get('/api/users/recently-active').expect(200);

      const ids = res.body.users.map((user: { id: string }) => user.id);
      expect(ids.filter((id: string) => id === h.id || id === i.id)).toEqual([i.id, h.id]);
      const row = res.body.users[ids.indexOf(i.id)];
      expect(row).toEqual({
        id: i.id,
        displayName: i.name,
        avatarUrl: null,
        languages: ['fr', 'de'],
      });
      // What /privacy says others see, and nothing more: no time either.
      expect(Object.keys(row).sort()).toEqual(['avatarUrl', 'displayName', 'id', 'languages']);
      expect(await recentIds(h)).not.toContain(h.id);
    });

    it('leaves out anyone you have a request or friendship with, either way', async () => {
      await tab(j);

      await h.agent.post(`/api/friends/requests/${j.id}`).expect(201);
      expect(await recentIds(h)).not.toContain(j.id);
      expect(await recentIds(j)).not.toContain(h.id);

      await j.agent.post(`/api/friends/requests/${h.id}/accept`).expect(204);
      expect(await recentIds(h)).not.toContain(j.id);
      expect(await recentIds(j)).not.toContain(h.id);

      await j.agent.delete(`/api/friends/${h.id}`).expect(204);
      expect(await recentIds(h)).toContain(j.id);
      expect(await recentIds(j)).toContain(h.id);
    });

    // Last here: its rows are stamped in the future, ahead of every tab above.
    it(`stops at ${RECENTLY_ACTIVE_LIMIT}, newest first, and skips the never seen`, async () => {
      const now = Date.now();
      const names = Array.from(
        { length: RECENTLY_ACTIVE_LIMIT + 1 },
        (_, n) => `${crowd}-r${String(n).padStart(2, '0')}`,
      );
      const never = `${crowd}-never`;
      await prisma.user.createMany({
        data: [
          ...names.map((displayName, n) => ({
            email: `${displayName}@example.com`,
            displayName,
            passwordHash: 'unused',
            lastSeenAt: new Date(now + n * 1000),
          })),
          { email: `${never}@example.com`, displayName: never, passwordHash: 'unused' },
        ],
      });

      const res = await h.agent.get('/api/users/recently-active').expect(200);

      const shown = res.body.users.map((user: { displayName: string }) => user.displayName);
      expect(shown).toEqual([...names].reverse().slice(0, RECENTLY_ACTIVE_LIMIT));
      expect(shown).not.toContain(never);
    });
  });

  it('a request reaches both users, is accepted, then removed, and a stranger hears none of it', async () => {
    const [bTab, aTab, cTab] = await Promise.all([tab(b), tab(a), tab(c)]);
    const bHeard = heard(bTab);
    const aHeard = heard(aTab);
    const cHeard = heard(cTab);

    // Sent: one event to each side, naming the other.
    let arrived = [nextEvent(bTab, 'friend:request'), nextEvent(aTab, 'friend:request')];
    const sent = await a.agent.post(`/api/friends/requests/${b.id}`).expect(201);
    expect(sent.body).toEqual({ status: 'pending' });
    expect(await Promise.all(arrived)).toEqual([{ userId: a.id }, { userId: b.id }]);
    expect(await friendsOf(a)).toMatchObject({ friends: [], received: [], sent: [{ id: b.id }] });
    expect(await friendsOf(b)).toMatchObject({ friends: [], received: [{ id: a.id }], sent: [] });

    // A duplicate, and accepting your own request.
    const again = await a.agent.post(`/api/friends/requests/${b.id}`).expect(409);
    expect(again.body.message).toBe('friend.alreadyRequested');
    const own = await a.agent.post(`/api/friends/requests/${b.id}/accept`).expect(404);
    expect(own.body.message).toBe('friend.requestNotFound');

    // C cannot reach the row between A and B: its key is built from C's own id.
    for (const res of await Promise.all([
      c.agent.post(`/api/friends/requests/${a.id}/accept`),
      c.agent.delete(`/api/friends/requests/${a.id}`),
      c.agent.delete(`/api/friends/${a.id}`),
    ])) {
      expect(res.status).toBe(404);
    }
    expect(await friendsOf(b)).toMatchObject({ received: [{ id: a.id }] });

    // Accepted: the 409 and the 404s above sent nothing, or B would have heard it first.
    arrived = [nextEvent(bTab, 'friend:accepted'), nextEvent(aTab, 'friend:accepted')];
    await b.agent.post(`/api/friends/requests/${a.id}/accept`).expect(204);
    expect(await Promise.all(arrived)).toEqual([{ userId: a.id }, { userId: b.id }]);
    expect(bHeard).toEqual([
      ['friend:request', { userId: a.id }],
      ['friend:accepted', { userId: a.id }],
    ]);
    expect(await friendsOf(a)).toMatchObject({ friends: [{ id: b.id }], received: [], sent: [] });
    expect(await friendsOf(b)).toMatchObject({ friends: [{ id: a.id }], received: [], sent: [] });

    const already = await a.agent.post(`/api/friends/requests/${b.id}`).expect(409);
    expect(already.body.message).toBe('friend.alreadyFriends');
    // The requests route never unfriends.
    const stale = await a.agent.delete(`/api/friends/requests/${b.id}`).expect(404);
    expect(stale.body.message).toBe('friend.requestNotFound');

    // Removed.
    arrived = [nextEvent(aTab, 'friend:removed'), nextEvent(bTab, 'friend:removed')];
    await b.agent.delete(`/api/friends/${a.id}`).expect(204);
    expect(await Promise.all(arrived)).toEqual([{ userId: b.id }, { userId: a.id }]);
    expect(await friendsOf(a)).toEqual({ friends: [], received: [], sent: [] });
    expect(await friendsOf(b)).toEqual({ friends: [], received: [], sent: [] });
    const gone = await b.agent.delete(`/api/friends/${a.id}`).expect(404);
    expect(gone.body.message).toBe('friend.notFound');
    expect(aHeard.map(([event]) => event)).toEqual([
      'friend:request',
      'friend:accepted',
      'friend:removed',
    ]);

    // C's own event comes after anything sent to C before it: it is the first.
    const ownEvent = nextEvent(cTab, 'friend:request');
    await c.agent.post(`/api/friends/requests/${d.id}`).expect(201);
    await ownEvent;
    expect(cHeard).toEqual([['friend:request', { userId: d.id }]]);
  });

  it('a declined request is gone, and can be sent again', async () => {
    await a.agent.post(`/api/friends/requests/${b.id}`).expect(201);

    await b.agent.delete(`/api/friends/requests/${a.id}`).expect(204);

    expect(await rowsNaming(a.id)).toEqual([]);
    await a.agent.post(`/api/friends/requests/${b.id}`).expect(201);
  });

  it('a request can be cancelled by its sender', async () => {
    await a.agent.delete(`/api/friends/requests/${b.id}`).expect(204);

    expect(await friendsOf(b)).toMatchObject({ received: [] });
  });

  it('refuses yourself, even with your id in upper case', async () => {
    for (const id of [b.id, b.id.toUpperCase()]) {
      const res = await b.agent.post(`/api/friends/requests/${id}`).expect(400);
      expect(res.body.message).toBe('friend.self');
    }
  });

  it('answers 404 for an unknown user and 400 for what is not an id', async () => {
    const unknown = await b.agent.post(`/api/friends/requests/${randomUUID()}`).expect(404);
    expect(unknown.body.message).toBe('user.notFound');

    const malformed = await b.agent.post('/api/friends/requests/not-a-uuid').expect(400);
    expect(malformed.body.message).toEqual(['request.invalid']);
  });

  describe('two requests that cross', () => {
    // Upper case on the way back: the same person, so the same pair and row.
    it('one after the other: the second accepts the first', async () => {
      const first = await d.agent.post(`/api/friends/requests/${e.id}`).expect(201);
      const second = await e.agent.post(`/api/friends/requests/${d.id.toUpperCase()}`).expect(201);

      expect([first.body.status, second.body.status]).toEqual(['pending', 'accepted']);
      expect(await rowsNaming(e.id)).toMatchObject([{ status: 'accepted' }]);
    });

    it('at once: one gets in, the other accepts it', async () => {
      await e.agent.delete(`/api/friends/${d.id}`).expect(204);

      const answers = await Promise.all([
        d.agent.post(`/api/friends/requests/${e.id}`),
        e.agent.post(`/api/friends/requests/${d.id}`),
      ]);

      expect(answers.map((res) => res.status)).toEqual([201, 201]);
      expect(answers.map((res) => res.body.status).sort()).toEqual(['accepted', 'pending']);
      expect(await rowsNaming(e.id)).toMatchObject([{ status: 'accepted' }]);
    });
  });

  it('deleting an account takes its requests with it', async () => {
    await f.agent.post(`/api/friends/requests/${a.id}`).expect(201);
    expect(await friendsOf(a)).toMatchObject({ received: [{ id: f.id }] });

    await prisma.user.delete({ where: { id: f.id } });

    expect(await friendsOf(a)).toMatchObject({ received: [] });
    expect(await rowsNaming(f.id)).toEqual([]);
  });

  // Last, and G's alone: every other account sends 5 times at most, so a new
  // case goes to one of them, not here.
  it('limits sending to 10 a minute per account', async () => {
    await g.agent.post(`/api/friends/requests/${a.id}`).expect(201);
    for (let i = 1; i < 10; i += 1) {
      await g.agent.post(`/api/friends/requests/${a.id}`).expect(409);
    }

    const limited = await g.agent.post(`/api/friends/requests/${a.id}`).expect(429);

    expect(limited.body.message).toBe('server.rateLimited');
  });
});
