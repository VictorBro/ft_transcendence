import { describe, expect, it } from 'vitest';

import {
  AppErrorSchema,
  CLIENT_EVENTS,
  CLIENT_EVENT_SCHEMAS,
  CourseUpdatedSchema,
  PresenceUpdateSchema,
  SERVER_EVENTS,
  clientEventSchema,
  userRoom,
} from './index';

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

  it('validates a presence update', () => {
    expect(
      PresenceUpdateSchema.parse({ userId, status: 'online', at: '2026-08-01T10:00:00.000Z' })
        .status,
    ).toBe('online');
  });

  it('carries an error code, never a sentence', () => {
    expect(AppErrorSchema.parse({ code: 'request.invalid' }).code).toBe('request.invalid');
    expect(AppErrorSchema.safeParse({ code: 'RATE_LIMITED' }).success).toBe(false);
    expect(AppErrorSchema.safeParse({ code: 'server.rateLimited', message: 'x' }).success).toBe(
      true,
    );
  });
});

describe('rooms', () => {
  it('names a user room', () => {
    expect(userRoom(userId)).toBe(`user:${userId}`);
  });
});
