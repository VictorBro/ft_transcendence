'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SERVER_EVENTS } from '@ft/shared';

import { useServerEvent } from './tab-socket';

/**
 * A friend's dot: green while they are online, grey when they are not.
 *
 * A client component, because it must change without a reload. It starts from
 * the value the server rendered, then follows presence:update over the socket.
 * Every dot on the page hears every update, so each one keeps only the updates
 * about its own friend.
 *
 * useState reads `online` once, at birth. Whoever renders the dot keys it on
 * that value, so when a refresh brings a newer one, a fresh dot starts from it.
 */
export function PresenceDot({ userId, online }: { userId: string; online: boolean }) {
  const t = useTranslations('FriendsPage');
  const [live, setLive] = useState(online);

  useServerEvent(SERVER_EVENTS.PRESENCE_UPDATE, (update) => {
    if (update.userId === userId) setLive(update.status === 'online');
  });

  return (
    // role="img" with a label: a screen reader says "Online" or "Offline"
    // instead of a colour it cannot see. The ring, the page's own background,
    // sets the dot apart from the avatar it sits on.
    <span
      role="img"
      aria-label={t(live ? 'online' : 'offline')}
      className={`size-3 rounded-full ring-2 ring-slate-950 ${live ? 'bg-green-500' : 'bg-slate-500'}`}
    />
  );
}
