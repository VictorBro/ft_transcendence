'use client';

import { useEffect, useRef } from 'react';
import type { ServerEventName } from '@ft/shared';

import { useRouter } from '@/i18n/navigation';
import { useServerEvent, useSocketStatus } from './tab-socket';

/**
 * Re-renders the page from the server when `event` arrives, the way a page
 * already updates after its own writes. Events sent while the tab was away are
 * lost, so connecting again counts as one, whatever closed the socket (a lost
 * connection, or a quiet retry after a session change). The first connect does
 * not: the page was just rendered. Renders nothing.
 */
export function RefreshOn({ event }: { event: ServerEventName }) {
  const router = useRouter();
  const status = useSocketStatus();
  const seen = useRef(false);
  const wasAway = useRef(false);

  useServerEvent(event, () => router.refresh());

  useEffect(() => {
    if (status === 'connected' && wasAway.current) router.refresh();
    if (status === 'connected') seen.current = true;
    wasAway.current = seen.current && status !== 'connected';
  }, [status, router]);

  return null;
}
