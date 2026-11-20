'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type ClientToServerEvents,
  type Message,
  type ServerEventName,
  type ServerToClientEvents,
  type SocketAck,
} from '@ft/shared';

import { createPresenceMap } from '@/lib/presence';
import {
  afterConnectError,
  afterDisconnect,
  apiIsUp,
  backoffMs,
  RETRY_FIRST_MS,
  type NextStep,
  type SocketStatus,
} from '@/lib/reconnect';
import { sendMessageOver } from '@/lib/send-message';
import { createUnreadStore, unreadTotal, type UnreadCounts } from '@/lib/unread';

type TabSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type Payload<E extends ServerEventName> = Parameters<ServerToClientEvents[E]>[0];

/*
 * The tab's one connection (what the issue calls the SocketProvider), its
 * status and its retry loop, in module scope rather than in a React provider:
 * route groups remount on navigation and the root layout remounts on a locale
 * switch, and none of that may drop a socket or a pending retry. Strict Mode's
 * second effect finds the same socket. Nothing runs during the server render:
 * the socket is made on first use.
 */
let tab: TabSocket | undefined;
let status: SocketStatus = 'closed';
let timer: ReturnType<typeof setTimeout> | undefined;
let attempt = 0;
// Bumped by every new owner of the socket, so a probe still out knows it lost.
let dial = 0;
const watchers = new Set<() => void>();
// Fed from the socket's own listeners, set up with it below, so no update is
// missed while no dot is on screen.
const presence = createPresenceMap();
// The same for the unread counts, so the account menu's badge is right on any page.
const unread = createUnreadStore();

function setStatus(next: SocketStatus): void {
  status = next;
  for (const watch of watchers) watch();
}

// Ends the pending retry, and the probe of one already under way.
function cancelRetry(): void {
  clearTimeout(timer);
  dial += 1;
}

// A failed WebSocket dial is a console error no code can hide, so a retry
// dials only once web says the API answers.
async function probeThenDial(): Promise<void> {
  const mine = dial;
  const up = await apiIsUp();
  // A newer dial owns the socket: dialing again would open a second server
  // socket, and a 'down' would mark a live one reconnecting.
  if (mine !== dial) return;
  if (up) {
    socket().connect();
    return;
  }
  setStatus('reconnecting');
  retryAfter(backoffMs(attempt++));
}

function retryAfter(ms: number): void {
  cancelRetry();
  timer = setTimeout(() => void probeThenDial(), ms);
}

function follow(step: NextStep): void {
  if (step === 'reconnect') {
    setStatus('reconnecting');
    retryAfter(backoffMs(attempt++));
  } else if (step === 'retryQuietly') {
    setStatus('closed');
    retryAfter(RETRY_FIRST_MS);
  } else if (step === 'signedOut') {
    // The session is over: its counts must not outlive it on this tab.
    unread.clear();
    setStatus('signedOut');
  }
}

function socket(): TabSocket {
  if (tab === undefined) {
    const created: TabSocket = io({
      path: '/ws',
      // Never long-polling: an open poll keeps the e2e settle() waiting, and a
      // polled 502 is a console error.
      transports: ['websocket'],
      autoConnect: false,
      // Our own loop above instead, so nothing dials while the API is down.
      reconnection: false,
      // Firefox logs an interrupted connection when a page unloads with a
      // socket open. socket.io leaves this off.
      closeOnBeforeunload: true,
    });
    created.on('connect', () => {
      attempt = 0;
      // Every connect brings a full snapshot of the friends, and what the tab
      // heard before may be stale: a friend:removed missed while away would
      // otherwise keep an old entry above a fresh render.
      presence.clear();
      setStatus('connected');
    });
    created.on('disconnect', (reason) => follow(afterDisconnect(reason)));
    created.on('connect_error', (error) =>
      follow(afterConnectError(created.active, error.message)),
    );
    created.on(SERVER_EVENTS.PRESENCE_UPDATE, (update) => presence.apply(update));
    created.on(SERVER_EVENTS.FRIEND_REMOVED, ({ userId }) => presence.forget(userId));
    // A new friend: no presence:update comes for someone already online, so
    // the dot must start from the render RefreshOn makes on this event, which
    // carries their `online`. Forgotten, so no older entry can stand above it.
    created.on(SERVER_EVENTS.FRIEND_ACCEPTED, ({ userId }) => presence.forget(userId));
    created.on(SERVER_EVENTS.DM_UNREAD, (snapshot) => unread.apply(snapshot));
    tab = created;
  }
  return tab;
}

/**
 * Called by ConnectionStatus on a signed-in page. A no-op while connected or
 * while the loop owns a lost connection (`active`: with reconnection off,
 * socket.io only clears it when the server closes or refuses the socket);
 * dials after a refusal, which is how a new sign-in in the same tab gets its
 * socket.
 */
export function connectSocket(): void {
  const current = socket();
  if (current.connected || current.active) return;
  // One owner: this dial replaces any pending retry.
  cancelRetry();
  // A new dial, so a refusal it meets is news again.
  if (status === 'signedOut') setStatus('closed');
  current.connect();
}

/**
 * Called on sign-out in this tab. The server has closed the socket already,
 * and the quiet retry that follows would dial from the anonymous page.
 */
export function closeSocket(): void {
  cancelRetry();
  tab?.disconnect();
  presence.clear();
  unread.clear();
  setStatus('closed');
}

/**
 * Whether this friend is online, as far as the tab has heard: the snapshot on
 * connect, then every presence:update. Falls back to `rendered`, the value the
 * server rendered, for a friend the tab has heard nothing about yet. The server
 * render and hydration use `rendered` too, so they always agree.
 */
export function useFriendOnline(userId: string, rendered: boolean): boolean {
  const heard = useSyncExternalStore(
    presence.subscribe,
    () => presence.get(userId),
    () => undefined,
  );
  return heard ?? rendered;
}

/**
 * Unread messages per conversation, as the tab last heard: undefined until the
 * first dm:unread, which comes with every connect.
 */
export function useUnreadCounts(): UnreadCounts | undefined {
  return useSyncExternalStore(unread.subscribe, unread.get, () => undefined);
}

/** Every conversation's, for the account menu. Undefined until heard, like the counts. */
export function useUnreadTotal(): number | undefined {
  const counts = useUnreadCounts();
  return counts === undefined ? undefined : unreadTotal(counts);
}

/**
 * One conversation's. Falls back to `rendered`, the server's count, until the
 * tab has heard; after that a conversation missing from the counts has none.
 */
export function useUnread(userId: string, rendered: number): number {
  const counts = useUnreadCounts();
  return counts === undefined ? rendered : (counts[userId] ?? 0);
}

/** The stored message or a code; never queued while offline, see lib/send-message.ts. */
export function sendMessage(userId: string, text: string): Promise<SocketAck<Message>> {
  return sendMessageOver(socket(), userId, text);
}

/**
 * Says what they sent you is read. Only while connected, and never queued: the
 * thread asks again on the next connect, with the fresh counts in front of it.
 */
export function markRead(userId: string): void {
  const current = socket();
  if (current.connected) current.emit(CLIENT_EVENTS.DM_READ, { userId });
}

function subscribe(watch: () => void): () => void {
  watchers.add(watch);
  return () => watchers.delete(watch);
}

export function useSocketStatus(): SocketStatus {
  return useSyncExternalStore(
    subscribe,
    () => status,
    () => 'closed',
  );
}

/** Listens for the component's lifetime; the latest handler always runs. */
export function useServerEvent<E extends ServerEventName>(
  event: E,
  handler: (payload: Payload<E>) => void,
): void {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    const current = socket();
    const listener = (payload: Payload<E>) => latest.current(payload);
    // socket.io cannot resolve its listener type for a generic event name.
    current.on(event, listener as never);
    return () => {
      current.off(event, listener as never);
    };
  }, [event]);
}
