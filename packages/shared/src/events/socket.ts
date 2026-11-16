import { z } from 'zod';

import { ERROR_CODES } from '../schemas/errors';
import { LanguageSchema } from '../schemas/language';

/**
 * socket.io reserves `connect`, `connect_error`, `disconnect`, `disconnecting`,
 * `newListener` and `removeListener`. Emitting any of them from application code
 * is silently swallowed or throws, which is why domain errors ride on `app:error`
 * instead of `error`. And no client event may be called `error`: one that reached
 * a server socket with no `error` listener would crash the process.
 */

/** None yet: #158 adds the first ones. */
export const CLIENT_EVENTS = {} as const;

export const SERVER_EVENTS = {
  COURSE_UPDATED: 'course:updated',
  FRIEND_REQUEST: 'friend:request',
  FRIEND_ACCEPTED: 'friend:accepted',
  FRIEND_REMOVED: 'friend:removed',
  PRESENCE_UPDATE: 'presence:update',
  APP_ERROR: 'app:error',
} as const;

export type ClientEventName = (typeof CLIENT_EVENTS)[keyof typeof CLIENT_EVENTS];
export type ServerEventName = (typeof SERVER_EVENTS)[keyof typeof SERVER_EVENTS];

/* ---------------------------------------------------------------- payloads */

/**
 * "Read this course again". The course page is rendered from GET /api/courses,
 * so the event names the course and carries none of its fields: there is one
 * source of truth. The room it goes to says whose course it is.
 */
export const CourseUpdatedSchema = z.object({
  lang: LanguageSchema,
});
export type CourseUpdated = z.infer<typeof CourseUpdatedSchema>;

/**
 * "Read your friends again", sent to both users of a pair. Names the other one,
 * as seen from the room it goes to, and none of their fields: /friends is
 * rendered from GET /api/friends. `removed` means the row between the two is
 * gone: a request declined or cancelled, or a friend removed.
 */
export const FriendEventSchema = z.object({ userId: z.uuid() });
export type FriendEvent = z.infer<typeof FriendEventSchema>;

/**
 * Online while at least one tab holds a socket, offline once the last one has
 * been closed for the grace period. No `away`: nothing in the app could tell it apart.
 */
export const PresenceStatusSchema = z.enum(['online', 'offline']);
export type PresenceStatus = z.infer<typeof PresenceStatusSchema>;

export const PresenceUpdateSchema = z.object({
  userId: z.uuid(),
  status: PresenceStatusSchema,
  at: z.iso.datetime(),
});
export type PresenceUpdate = z.infer<typeof PresenceUpdateSchema>;

/** An ERROR_CODES entry, like every HTTP error, so the browser words it in its own language. */
export const AppErrorSchema = z.object({
  code: z.enum(ERROR_CODES),
});
export type AppError = z.infer<typeof AppErrorSchema>;

/**
 * Anything arriving on the gateway is untrusted, including from our own client.
 * The gateway parses every event with this map before a handler sees it.
 */
export const CLIENT_EVENT_SCHEMAS = {} as const satisfies Record<ClientEventName, z.ZodType>;

const schemas: Readonly<Record<string, z.ZodType>> = CLIENT_EVENT_SCHEMAS;

/** `hasOwn`, so a client sending "constructor" or "__proto__" finds no schema. */
export function clientEventSchema(event: string): z.ZodType | undefined {
  return Object.hasOwn(schemas, event) ? schemas[event] : undefined;
}

/* ------------------------------------------------------------- typed pairs */

export interface ServerToClientEvents {
  [SERVER_EVENTS.COURSE_UPDATED]: (payload: CourseUpdated) => void;
  [SERVER_EVENTS.FRIEND_REQUEST]: (payload: FriendEvent) => void;
  [SERVER_EVENTS.FRIEND_ACCEPTED]: (payload: FriendEvent) => void;
  [SERVER_EVENTS.FRIEND_REMOVED]: (payload: FriendEvent) => void;
  [SERVER_EVENTS.PRESENCE_UPDATE]: (payload: PresenceUpdate) => void;
  [SERVER_EVENTS.APP_ERROR]: (payload: AppError) => void;
}

/** Empty until #158: an interface with no member would trip no-empty-object-type. */
export type ClientToServerEvents = Record<string, never>;

/** Nothing crosses between nodes yet; the Redis adapter will fill this in. */
export type InterServerEvents = Record<string, never>;

/** Set by the gateway's handshake middleware. `sessionId` is express-session's id. */
export interface SocketData {
  userId: string;
  sessionId: string;
}

/* ------------------------------------------------------------------- rooms */

export function userRoom(userId: string): string {
  return `user:${userId}`;
}
