import { describe, expect, it } from 'vitest';

import {
  CHAT_SEND_MAX_LENGTH,
  CLIENT_EVENTS,
  CLIENT_EVENT_SCHEMAS,
  ChatMessageSchema,
  ChatSendSchema,
  PresenceUpdateSchema,
  SERVER_EVENTS,
  SessionStateSchema,
  SocketErrorSchema,
  sessionRoom,
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

const publicUser = {
  id: '3f0f9d1e-8a2c-4f3b-9c1d-6d2c5b8a7e41',
  displayName: 'ada_lovelace',
  avatarUrl: null,
  locale: 'fr',
};

const sessionId = '8c1f4e2a-5b6d-4a7c-8e9f-0a1b2c3d4e5f';

describe('event names', () => {
  it('never collides with a socket.io reserved name', () => {
    const all = [...Object.values(CLIENT_EVENTS), ...Object.values(SERVER_EVENTS)];

    for (const name of all) {
      expect(SOCKET_IO_RESERVED).not.toContain(name);
    }
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

describe('ChatSendSchema', () => {
  it('accepts a trimmed message', () => {
    expect(ChatSendSchema.parse({ sessionId, body: '  bonjour  ' }).body).toBe('bonjour');
  });

  it('rejects an empty body, an oversized body and a bad session id', () => {
    expect(ChatSendSchema.safeParse({ sessionId, body: '   ' }).success).toBe(false);
    expect(
      ChatSendSchema.safeParse({ sessionId, body: 'x'.repeat(CHAT_SEND_MAX_LENGTH + 1) }).success,
    ).toBe(false);
    expect(ChatSendSchema.safeParse({ sessionId: 'lobby', body: 'hi' }).success).toBe(false);
  });
});

describe('server payloads', () => {
  it('validates session state', () => {
    const state = SessionStateSchema.parse({
      sessionId,
      locale: 'fr',
      participants: [publicUser],
    });

    expect(state.participants).toHaveLength(1);
  });

  it('validates a chat message and a presence update', () => {
    const message = ChatMessageSchema.parse({
      id: '11111111-2222-4333-8444-555555555555',
      sessionId,
      author: publicUser,
      body: 'bonjour',
      sentAt: '2026-08-01T10:00:00.000Z',
    });

    expect(message.author.displayName).toBe('ada_lovelace');

    expect(
      PresenceUpdateSchema.parse({
        userId: publicUser.id,
        status: 'away',
        at: '2026-08-01T10:00:00.000Z',
      }).status,
    ).toBe('away');
  });

  it('rejects an unknown error code', () => {
    expect(SocketErrorSchema.parse({ code: 'RATE_LIMITED', message: 'slow down' }).code).toBe(
      'RATE_LIMITED',
    );
    expect(SocketErrorSchema.safeParse({ code: 'TEAPOT', message: 'no' }).success).toBe(false);
  });
});

describe('rooms', () => {
  it('namespaces sessions and users apart', () => {
    expect(sessionRoom(sessionId)).toBe(`session:${sessionId}`);
    expect(userRoom(publicUser.id)).toBe(`user:${publicUser.id}`);
    expect(sessionRoom(sessionId)).not.toBe(userRoom(sessionId));
  });
});
