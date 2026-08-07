import { z } from 'zod';

import { LocaleSchema, type Locale } from '../schemas/locale';
import { PublicUserSchema } from '../schemas/user';

/**
 * socket.io reserves `connect`, `connect_error`, `disconnect`, `disconnecting`,
 * `newListener` and `removeListener`. Emitting any of them from application code
 * is silently swallowed or throws, which is why domain errors ride on `app:error`
 * instead of `error`.
 */
export const CLIENT_EVENTS = {
  SESSION_JOIN: 'session:join',
  SESSION_LEAVE: 'session:leave',
  CHAT_SEND: 'chat:send',
} as const;

export const SERVER_EVENTS = {
  SESSION_STATE: 'session:state',
  SESSION_PEER_JOINED: 'session:peer-joined',
  SESSION_PEER_LEFT: 'session:peer-left',
  CHAT_MESSAGE: 'chat:message',
  PRESENCE_UPDATE: 'presence:update',
  APP_ERROR: 'app:error',
} as const;

export type ClientEventName = (typeof CLIENT_EVENTS)[keyof typeof CLIENT_EVENTS];
export type ServerEventName = (typeof SERVER_EVENTS)[keyof typeof SERVER_EVENTS];

/* ---------------------------------------------------------------- payloads */

export const SessionJoinSchema = z.object({
  sessionId: z.uuid(),
});
export type SessionJoin = z.infer<typeof SessionJoinSchema>;

export const SessionLeaveSchema = z.object({
  sessionId: z.uuid(),
});
export type SessionLeave = z.infer<typeof SessionLeaveSchema>;

/** Exported so a character counter in the UI cannot drift from the server rule. */
export const CHAT_SEND_MAX_LENGTH = 500;

export const ChatSendSchema = z.object({
  sessionId: z.uuid(),
  body: z.string().trim().min(1).max(CHAT_SEND_MAX_LENGTH),
});
export type ChatSend = z.infer<typeof ChatSendSchema>;

export const SessionStateSchema = z.object({
  sessionId: z.uuid(),
  locale: LocaleSchema,
  participants: z.array(PublicUserSchema).max(8),
});
export type SessionState = z.infer<typeof SessionStateSchema>;

export const SessionPeerSchema = z.object({
  sessionId: z.uuid(),
  user: PublicUserSchema,
});
export type SessionPeer = z.infer<typeof SessionPeerSchema>;

export const ChatMessageSchema = z.object({
  id: z.uuid(),
  sessionId: z.uuid(),
  author: PublicUserSchema,
  body: z.string().min(1).max(CHAT_SEND_MAX_LENGTH),
  sentAt: z.iso.datetime(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const PresenceStatusSchema = z.enum(['online', 'away', 'offline']);
export type PresenceStatus = z.infer<typeof PresenceStatusSchema>;

export const PresenceUpdateSchema = z.object({
  userId: z.uuid(),
  status: PresenceStatusSchema,
  at: z.iso.datetime(),
});
export type PresenceUpdate = z.infer<typeof PresenceUpdateSchema>;

export const SocketErrorCodeSchema = z.enum([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'RATE_LIMITED',
  'VALIDATION_FAILED',
  'INTERNAL',
]);
export type SocketErrorCode = z.infer<typeof SocketErrorCodeSchema>;

export const SocketErrorSchema = z.object({
  code: SocketErrorCodeSchema,
  message: z.string().min(1),
});
export type SocketError = z.infer<typeof SocketErrorSchema>;

/**
 * Anything arriving on a gateway is untrusted, including from our own client.
 * Handlers parse with this map before touching the payload.
 */
export const CLIENT_EVENT_SCHEMAS = {
  [CLIENT_EVENTS.SESSION_JOIN]: SessionJoinSchema,
  [CLIENT_EVENTS.SESSION_LEAVE]: SessionLeaveSchema,
  [CLIENT_EVENTS.CHAT_SEND]: ChatSendSchema,
} as const;

/* ------------------------------------------------------------- typed pairs */

/** Acknowledgement envelope. Generated server side, so it needs no schema. */
export type SocketAck<TData> =
  { status: 'ok'; data: TData } | { status: 'error'; error: SocketError };

export interface ServerToClientEvents {
  [SERVER_EVENTS.SESSION_STATE]: (payload: SessionState) => void;
  [SERVER_EVENTS.SESSION_PEER_JOINED]: (payload: SessionPeer) => void;
  [SERVER_EVENTS.SESSION_PEER_LEFT]: (payload: SessionPeer) => void;
  [SERVER_EVENTS.CHAT_MESSAGE]: (payload: ChatMessage) => void;
  [SERVER_EVENTS.PRESENCE_UPDATE]: (payload: PresenceUpdate) => void;
  [SERVER_EVENTS.APP_ERROR]: (payload: SocketError) => void;
}

export interface ClientToServerEvents {
  [CLIENT_EVENTS.SESSION_JOIN]: (
    payload: SessionJoin,
    ack: (result: SocketAck<SessionState>) => void,
  ) => void;
  [CLIENT_EVENTS.SESSION_LEAVE]: (payload: SessionLeave) => void;
  [CLIENT_EVENTS.CHAT_SEND]: (
    payload: ChatSend,
    ack: (result: SocketAck<ChatMessage>) => void,
  ) => void;
}

/** Nothing crosses between nodes yet; the Redis adapter will fill this in. */
export type InterServerEvents = Record<string, never>;

/** Attached by the gateway auth guard once the handshake is verified. */
export interface SocketData {
  userId: string;
  locale: Locale;
}

/* ------------------------------------------------------------------- rooms */

export function sessionRoom(sessionId: string): string {
  return `session:${sessionId}`;
}

export function userRoom(userId: string): string {
  return `user:${userId}`;
}
