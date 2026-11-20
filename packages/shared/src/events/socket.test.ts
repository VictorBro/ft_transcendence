import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  AppErrorSchema,
  CLIENT_EVENTS,
  CLIENT_EVENT_SCHEMAS,
  CourseUpdatedSchema,
  DmMessageSchema,
  DmReadSchema,
  DmSendSchema,
  DmUnreadSchema,
  FriendEventSchema,
  PresenceUpdateSchema,
  SERVER_EVENTS,
  clientEventSchema,
  userRoom,
} from './index';
import { MESSAGE_MAX_LENGTH } from '../schemas/message';

const SOCKET_IO_RESERVED = [
  'connect',
  'connect_error',
  'disconnect',
  'disconnecting',
  'newListener',
  'removeListener',
];

const userId = '3f0f9d1e-8a2c-4f3b-9c1d-6d2c5b8a7e41';

describe('event names', () => {
  it('never collides with a socket.io reserved name', () => {
    const all = [...Object.values(CLIENT_EVENTS), ...Object.values(SERVER_EVENTS)];

    for (const name of all) {
      expect(SOCKET_IO_RESERVED).not.toContain(name);
    }
  });

  // A client event named `error` would reach a server socket with no `error`
  // listener, and an EventEmitter throws on that.
  it('never names a client event `error`', () => {
    expect(Object.values(CLIENT_EVENTS)).not.toContain('error');
  });

  it('keeps the client and server sets disjoint', () => {
    const client = new Set<string>(Object.values(CLIENT_EVENTS));

    for (const name of Object.values(SERVER_EVENTS)) {
      expect(client.has(name)).toBe(false);
    }
  });

  it('has a validation schema for every inbound event', () => {
    expect(Object.keys(CLIENT_EVENT_SCHEMAS).sort()).toEqual(Object.values(CLIENT_EVENTS).sort());
  });
});

describe('clientEventSchema', () => {
  it.each(['nope', 'constructor', '__proto__', 'toString'])('finds nothing for %s', (name) => {
    expect(clientEventSchema(name)).toBeUndefined();
  });
});

describe('server payloads', () => {
  it('names a course, and only a course language', () => {
    expect(CourseUpdatedSchema.parse({ lang: 'fr' })).toEqual({ lang: 'fr' });
    expect(CourseUpdatedSchema.safeParse({ lang: 'xx' }).success).toBe(false);
  });

  it('names the other user of a friend event', () => {
    const other = randomUUID();

    expect(FriendEventSchema.parse({ userId: other })).toEqual({ userId: other });
    expect(FriendEventSchema.safeParse({ userId: 'nope' }).success).toBe(false);
  });

  it('validates a presence update', () => {
    expect(
      PresenceUpdateSchema.parse({ userId, status: 'online', at: '2026-08-01T10:00:00.000Z' })
        .status,
    ).toBe('online');
  });

  it('knows two presence states, and no away', () => {
    const at = '2026-08-01T10:00:00.000Z';

    expect(PresenceUpdateSchema.parse({ userId, status: 'offline', at }).status).toBe('offline');
    expect(PresenceUpdateSchema.safeParse({ userId, status: 'away', at }).success).toBe(false);
  });

  it('carries an error code, never a sentence', () => {
    expect(AppErrorSchema.parse({ code: 'request.invalid' }).code).toBe('request.invalid');
    expect(AppErrorSchema.safeParse({ code: 'RATE_LIMITED' }).success).toBe(false);
    expect(AppErrorSchema.safeParse({ code: 'server.rateLimited', message: 'x' }).success).toBe(
      true,
    );
  });
});

describe('direct messages', () => {
  const upper = userId.toUpperCase();

  // The id keys the pair, which is text: one person must not pass for two.
  it('lower-cases the other user', () => {
    expect(DmSendSchema.parse({ userId: upper, text: 'salut' }).userId).toBe(userId);
    expect(DmReadSchema.parse({ userId: upper }).userId).toBe(userId);
  });

  it('sends trimmed text of 1 to 1,000 characters', () => {
    expect(DmSendSchema.parse({ userId, text: '  salut \n' }).text).toBe('salut');
    expect(DmSendSchema.safeParse({ userId, text: 'x'.repeat(MESSAGE_MAX_LENGTH) }).success).toBe(
      true,
    );
  });

  it.each([
    ['empty', '', 'message.empty'],
    ['spaces only', '   ', 'message.empty'],
    ['too long', 'x'.repeat(MESSAGE_MAX_LENGTH + 1), 'message.tooLong'],
    ['not text', 42, 'message.empty'],
    ['holding a NUL', 'a\u0000b', 'request.invalid'],
  ])('refuses a message that is %s', (_, text, code) => {
    const parsed = DmSendSchema.safeParse({ userId, text });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(code);
  });

  it('refuses a send to something that is not a user id', () => {
    expect(DmSendSchema.safeParse({ userId: 'nope', text: 'salut' }).success).toBe(false);
    expect(DmReadSchema.safeParse({}).success).toBe(false);
  });

  it('carries the stored message and the conversation it belongs to', () => {
    const message = {
      id: randomUUID(),
      senderId: userId,
      text: 'salut',
      createdAt: '2026-08-01T10:00:00.000Z',
    };

    expect(DmMessageSchema.parse({ userId: randomUUID(), message }).message).toEqual(message);
  });

  // A conversation with nothing unread is left out rather than sent as 0.
  it('counts unread messages per conversation, only where there are some', () => {
    const at = '2026-08-01T10:00:00.000Z';

    expect(DmUnreadSchema.parse({ counts: { [userId]: 2 }, at }).counts[userId]).toBe(2);
    expect(DmUnreadSchema.parse({ counts: {}, at }).counts).toEqual({});
    expect(DmUnreadSchema.safeParse({ counts: { [userId]: 0 }, at }).success).toBe(false);
    expect(DmUnreadSchema.safeParse({ counts: { nope: 1 }, at }).success).toBe(false);
    expect(DmUnreadSchema.safeParse({ counts: {} }).success).toBe(false);
  });
});

describe('rooms', () => {
  it('names a user room', () => {
    expect(userRoom(userId)).toBe(`user:${userId}`);
  });
});
