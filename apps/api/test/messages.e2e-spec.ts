import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  MESSAGE_MAX_LENGTH,
  MESSAGE_PAGE_SIZE,
  type AppError,
  type Conversations,
  type DmMessage,
  type DmUnread,
  type Message,
  type MessagePage,
  type SocketAck,
} from '@ft/shared';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { pairKey } from '../src/friends/pair';
import { SocketsService } from '../src/gateway/sockets.service';
import { SEND_LIMIT_PER_MINUTE } from '../src/messages/messages.service';
import { wsConnections } from '../src/metrics/metrics';
import { PrismaService } from '../src/prisma/prisma.service';
import { seriesValue } from './metrics.fixtures';
import {
  type ClientSocket,
  collect,
  connect,
  connected,
  nextEvent,
  ready,
  sessionCookie,
} from './socket.fixtures';

type Account = { agent: TestAgent; cookie: string; id: string };

/**
 * The two routes behind the guard and the id pipe, and dm:send and dm:read on
 * real sockets. Needs a real Postgres and Redis, which CI provides as services.
 */
describe('messages (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let port: number;

  const stamp = Date.now();
  const password = 'Correct-Horse-9';
  const labels = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm'];
  const emailOf = (label: string) => `msg-${label}-${stamp}@example.com`;

  // A and B are friends; C is a stranger to A, and D has only sent A a request.
  // E and F have a long history, written straight to the database. G is friends
  // with H and I, for the list; J with K, for the counts; L with M, for the budget.
  let a: Account;
  let b: Account;
  let c: Account;
  let d: Account;
  let e: Account;
  let f: Account;
  let g: Account;
  let h: Account;
  let i: Account;
  let j: Account;
  let k: Account;
  let l: Account;
  let m: Account;

  /** E and F's messages, oldest first, as the history must give them back. */
  let history: string[] = [];
  const HISTORY = 2 * MESSAGE_PAGE_SIZE + 7;

  /** Each agent its own TEST-NET-1 address, so signups never meet their limit. */
  let addresses = 0;
  const agentFrom = () => {
    addresses += 1;
    return request.agent(app.getHttpServer()).set('X-Forwarded-For', `192.0.2.${addresses}`);
  };

  const signUp = async (label: string): Promise<Account> => {
    const agent = agentFrom();
    const res = await agent
      .post('/api/auth/signup')
      .send({ email: emailOf(label), displayName: `msg${label}${stamp}`, password })
      .expect(201);
    return { agent, cookie: sessionCookie(res), id: res.body.id as string };
  };

  const befriend = async (one: Account, other: Account) => {
    await one.agent.post(`/api/friends/requests/${other.id}`).expect(201);
    await other.agent.post(`/api/friends/requests/${one.id}/accept`).expect(204);
  };

  const opened: ClientSocket[] = [];
  const tab = (account: Account) => {
    const socket = connect(port, account.cookie);
    opened.push(socket);
    return ready(socket);
  };

  /** A new tab, and the dm:unread it got on connect. */
  const snapshotOf = async (account: Account) => {
    const socket = connect(port, account.cookie);
    opened.push(socket);
    const [, snapshot] = await Promise.all([
      connected(socket),
      nextEvent<DmUnread>(socket, 'dm:unread'),
    ]);
    return { socket, snapshot };
  };

  /** Rejects when no ack comes within 5 s, rather than waiting out the test's timeout. */
  const send = (socket: ClientSocket, userId: string, text: string, ...extra: unknown[]) =>
    socket.timeout(5_000).emitWithAck('dm:send', { userId, text }, ...extra) as Promise<
      SocketAck<Message>
    >;

  /** A send between friends: the message it stored. */
  const sent = async (socket: ClientSocket, userId: string, text: string) => {
    const ack = await send(socket, userId, text);
    if (!ack.ok) throw new Error(`send refused: ${ack.code}`);
    return ack.data;
  };

  /** Every event the socket gets from now on, in order. */
  const heard = (socket: ClientSocket) => {
    const seen: [string, unknown][] = [];
    socket.onAny((event: string, payload: unknown) => seen.push([event, payload]));
    return seen;
  };

  /** Sent after everything else to this user: once it arrives, anything sent before it has. */
  const barrier = async (socket: ClientSocket, userId: string) => {
    const arrived = nextEvent(socket, 'course:updated');
    app.get(SocketsService).toUser(userId, 'course:updated', { lang: 'fr' });
    await arrived;
  };

  const unread = (counts: Record<string, number>) => ({ counts, at: expect.any(String) });
  const pageOf = async (account: Account, userId: string, cursor?: string) =>
    (
      await account.agent
        .get(`/api/conversations/${userId}/messages`)
        .query(cursor ? { cursor } : {})
        .expect(200)
    ).body as MessagePage;
  const conversationsOf = async (account: Account) =>
    ((await account.agent.get('/api/conversations').expect(200)).body as Conversations)
      .conversations;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    // A real port, not init(): socket.io needs a listening server to dial.
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as AddressInfo).port;
    prisma = app.get(PrismaService);

    [a, b, c, d, e, f, g, h, i, j, k, l, m] = await Promise.all(labels.map(signUp));
    await befriend(a, b);
    await befriend(g, h);
    await befriend(g, i);
    await befriend(j, k);
    await befriend(l, m);
    await d.agent.post(`/api/friends/requests/${a.id}`).expect(201);

    // Two messages a millisecond: the id has to break the tie, in the order and the cursor.
    const key = pairKey(e.id, f.id);
    const [userAId, userBId] = [e.id, f.id].sort();
    const start = Date.now() - 60_000;
    await prisma.conversation.create({ data: { pairKey: key, userAId, userBId } });
    await prisma.message.createMany({
      data: Array.from({ length: HISTORY }, (_, n) => ({
        pairKey: key,
        senderId: n % 3 === 0 ? f.id : e.id,
        text: `message ${n}`,
        createdAt: new Date(start + Math.floor(n / 2)),
      })),
    });
    history = (
      await prisma.message.findMany({
        where: { pairKey: key },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      })
    ).map((message) => message.id);
  });

  // Until the server has seen every close, so each test starts with no socket open.
  afterEach(async () => {
    for (const socket of opened.splice(0)) socket.close();
    await vi.waitFor(async () => expect(await seriesValue(wsConnections)).toBe(0));
  });

  afterAll(async () => {
    // Friendships, conversations and messages cascade on either user.
    await prisma.user.deleteMany({ where: { email: { in: labels.map(emailOf) } } });
    await app.close();
  });

  it('refuses both routes without a session', async () => {
    const server = request(app.getHttpServer());

    const responses = await Promise.all([
      server.get('/api/conversations'),
      server.get(`/api/conversations/${randomUUID()}/messages`),
    ]);

    for (const res of responses) {
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('auth.sessionRequired');
    }
  });

  it('answers 400 for what is not a user id, and for a cursor that is malformed or elsewhere', async () => {
    const malformed = await a.agent.get('/api/conversations/not-a-uuid/messages').expect(400);
    expect(malformed.body.message).toEqual(['request.invalid']);

    const notAnId = await e.agent
      .get(`/api/conversations/${f.id}/messages`)
      .query({ cursor: 'nope' })
      .expect(400);
    expect(notAnId.body.message).toEqual(['request.invalid']);

    // A message of E's, but of another conversation; and no message at all.
    for (const [other, cursor] of [
      [a.id, history[10]],
      [f.id, randomUUID()],
    ]) {
      const elsewhere = await e.agent
        .get(`/api/conversations/${other}/messages`)
        .query({ cursor })
        .expect(400);
      expect(elsewhere.body.message).toBe('request.invalid');
    }
  });

  it('pages the history back from the newest, each page oldest first, with no overlap', async () => {
    const pages: MessagePage[] = [await pageOf(e, f.id)];
    for (let cursor = pages[0].nextCursor; cursor !== null && pages.length < 10;) {
      const page = await pageOf(e, f.id, cursor);
      pages.push(page);
      cursor = page.nextCursor;
    }

    expect(pages.map((page) => page.messages.length)).toEqual([
      MESSAGE_PAGE_SIZE,
      MESSAGE_PAGE_SIZE,
      HISTORY - 2 * MESSAGE_PAGE_SIZE,
    ]);
    expect(pages.at(-1)?.nextCursor).toBeNull();
    const ids = pages.toReversed().flatMap((page) => page.messages.map((message) => message.id));
    expect(ids).toEqual(history);
    // What /privacy says is shown, and nothing more: readAt stays on the server.
    expect(Object.keys(pages[0].messages[0]).sort()).toEqual([
      'createdAt',
      'id',
      'senderId',
      'text',
    ]);
    // The same history from the other side, and with the id typed in upper case.
    expect(await pageOf(f, e.id.toUpperCase())).toEqual(pages[0]);
  });

  it('a stranger, a pending request and yourself cannot send, and nothing is stored', async () => {
    const [aTab, cTab, dTab] = await Promise.all([tab(a), tab(c), tab(d)]);
    const aHeard = heard(aTab);

    const answers = await Promise.all([
      send(cTab, a.id, 'salut'),
      send(dTab, a.id, 'salut'),
      send(aTab, d.id, 'salut'),
      send(aTab, a.id, 'salut'),
    ]);

    expect(answers).toEqual(Array(4).fill({ ok: false, code: 'message.notFriends' }));
    const keys = [pairKey(a.id, c.id), pairKey(a.id, d.id), pairKey(a.id, a.id)];
    expect(await prisma.conversation.count({ where: { pairKey: { in: keys } } })).toBe(0);
    expect(await prisma.message.count({ where: { pairKey: { in: keys } } })).toBe(0);
    await barrier(aTab, a.id);
    expect(aHeard).toEqual([['course:updated', { lang: 'fr' }]]);
  });

  it("a friend's message reaches the recipient and every tab of the sender, and is counted", async () => {
    // B first: its online then reaches no tab of A's, so A hears nothing but what follows.
    const bTab = await tab(b);
    const [aTab, aOther] = await Promise.all([tab(a), tab(a)]);
    const aHeard = heard(aOther);
    const delivered = [
      nextEvent<DmMessage>(bTab, 'dm:message'),
      nextEvent<DmMessage>(aOther, 'dm:message'),
      nextEvent<DmMessage>(aTab, 'dm:message'),
    ];
    const counted = nextEvent<DmUnread>(bTab, 'dm:unread');

    // Upper case: the same person, so the same conversation.
    const ack = await send(aTab, b.id.toUpperCase(), '  salut  ');

    const stored = await prisma.message.findFirstOrThrow({ where: { senderId: a.id } });
    expect(stored).toMatchObject({ pairKey: pairKey(a.id, b.id), text: 'salut', readAt: null });
    const message = {
      id: stored.id,
      senderId: a.id,
      text: 'salut',
      createdAt: stored.createdAt.toISOString(),
    };
    expect(ack).toEqual({ ok: true, data: message });
    // Each names the other person of the conversation, as seen from its room.
    expect(await Promise.all(delivered)).toEqual([
      { userId: a.id, message },
      { userId: b.id, message },
      { userId: b.id, message },
    ]);
    expect(await counted).toEqual(unread({ [a.id]: 1 }));
    // The sender's count does not change: nothing reached A but the message.
    await barrier(aOther, a.id);
    expect(aHeard).toEqual([
      ['dm:message', { userId: b.id, message }],
      ['course:updated', { lang: 'fr' }],
    ]);
  });

  it('the count: sent on connect, raised by each message, cleared on every tab by reading', async () => {
    const first = await snapshotOf(k);
    expect(first.snapshot).toEqual(unread({}));
    const jTab = await tab(j);

    for (const expected of [1, 2]) {
      const counted = nextEvent<DmUnread>(first.socket, 'dm:unread');
      await sent(jTab, k.id, `hello ${expected}`);
      expect(await counted).toEqual(unread({ [j.id]: expected }));
    }

    const second = await snapshotOf(k);
    expect(second.snapshot).toEqual(unread({ [j.id]: 2 }));

    const cleared = [first.socket, second.socket].map((socket) =>
      nextEvent<DmUnread>(socket, 'dm:unread'),
    );
    second.socket.emit('dm:read', { userId: j.id });
    expect(await Promise.all(cleared)).toEqual([unread({}), unread({})]);
    expect(await prisma.message.count({ where: { senderId: j.id, readAt: null } })).toBe(0);
    expect((await snapshotOf(k)).snapshot).toEqual(unread({}));
  });

  it('lists conversations by their latest message, each with what is unread', async () => {
    const [gTab, iTab] = await Promise.all([tab(g), tab(i)]);
    const gUnread = collect<DmUnread>(gTab, 'dm:unread');
    const toH = await sent(gTab, h.id, 'one');
    await sent(iTab, g.id, 'two');
    const fromI = await sent(iTab, g.id, 'three');

    expect(await conversationsOf(g)).toEqual([
      { user: expect.objectContaining({ id: i.id }), lastMessageAt: fromI.createdAt, unread: 2 },
      { user: expect.objectContaining({ id: h.id }), lastMessageAt: toH.createdAt, unread: 0 },
    ]);
    expect(await conversationsOf(h)).toEqual([
      {
        user: { id: g.id, displayName: `msgg${stamp}`, avatarUrl: null },
        lastMessageAt: toH.createdAt,
        unread: 1,
      },
    ]);

    // A new message moves its conversation up; reading leaves the order alone.
    const again = await sent(gTab, h.id, 'four');
    gTab.emit('dm:read', { userId: i.id });
    // Waited for among all G hears: I's messages each sent G a count too, in no set order.
    await vi.waitFor(() => expect(gUnread).toContainEqual(unread({})));
    expect(await conversationsOf(g)).toEqual([
      { user: expect.objectContaining({ id: h.id }), lastMessageAt: again.createdAt, unread: 0 },
      { user: expect.objectContaining({ id: i.id }), lastMessageAt: fromI.createdAt, unread: 0 },
    ]);
  });

  it('answers the ack of an event it refuses, never app:error as well, and stores nothing', async () => {
    const aTab = await tab(a);
    const errors = collect<AppError>(aTab, 'app:error');
    const before = await prisma.message.count({ where: { senderId: a.id } });

    const answers = await Promise.all([
      send(aTab, b.id, '   '),
      send(aTab, b.id, 'x'.repeat(MESSAGE_MAX_LENGTH + 1)),
      send(aTab, 'not-a-uuid', 'salut'),
      send(aTab, b.id, 'salut', 'one argument too many'),
      aTab.timeout(5_000).emitWithAck('dm:nope', {}),
    ]);

    expect(answers).toEqual([
      { ok: false, code: 'message.empty' },
      { ok: false, code: 'message.tooLong' },
      { ok: false, code: 'request.invalid' },
      { ok: false, code: 'request.invalid' },
      { ok: false, code: 'request.invalid' },
    ]);
    // An app:error would have been sent before its ack's answer.
    expect(errors).toEqual([]);
    expect(await prisma.message.count({ where: { senderId: a.id } })).toBe(before);
  });

  // Each tab has its own screen, so a new one must not bring a new budget.
  it('refuses a send past the budget of a minute, from any tab of the account', async () => {
    const [one, two, three] = await Promise.all([tab(l), tab(l), tab(l)]);
    // Half each, under what one socket may send in a window.
    for (const socket of [one, two]) {
      for (let n = 0; n < SEND_LIMIT_PER_MINUTE / 2; n += 1) await sent(socket, m.id, `hi ${n}`);
    }

    expect(await send(three, m.id, 'one too many')).toEqual({
      ok: false,
      code: 'server.rateLimited',
    });
    expect(await prisma.message.count({ where: { senderId: l.id } })).toBe(SEND_LIMIT_PER_MINUTE);
  });

  // Last: A and B are no longer friends after it.
  it('after unfriending, both still read the history, and neither can send', async () => {
    const before = await pageOf(a, b.id);
    expect(before.messages.length).toBeGreaterThan(0);

    await a.agent.delete(`/api/friends/${b.id}`).expect(204);

    expect(await pageOf(a, b.id)).toEqual(before);
    expect(await pageOf(b, a.id)).toEqual(before);
    expect((await conversationsOf(b)).map((conversation) => conversation.user.id)).toEqual([a.id]);
    const [aTab, bTab] = await Promise.all([tab(a), tab(b)]);
    expect(await send(aTab, b.id, 'still there?')).toEqual({
      ok: false,
      code: 'message.notFriends',
    });
    expect(await send(bTab, a.id, 'yes')).toEqual({ ok: false, code: 'message.notFriends' });
    expect(await pageOf(a, b.id)).toEqual(before);
  });
});
