'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerEventName, ServerToClientEvents } from '@ft/shared';

import {
  afterConnectError,
  afterDisconnect,
  apiIsUp,
  backoffMs,
  RETRY_FIRST_MS,
  type NextStep,
  type SocketStatus,
} from '@/lib/reconnect';

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
      setStatus('connected');
    });
    created.on('disconnect', (reason) => follow(afterDisconnect(reason)));
    created.on('connect_error', (error) =>
      follow(afterConnectError(created.active, error.message)),
    );
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
  setStatus('closed');
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
