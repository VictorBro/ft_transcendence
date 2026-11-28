'use client';

import { useFormatter, useTranslations } from 'next-intl';

import { badgeText, menuTotal } from '@/lib/unread';
import { useFriendPending, useUnreadTotal } from './tab-socket';

/*
 * Counts in the account menu. Nothing at 0, nor before anything is known, so a
 * 0 never flashes on first paint. Unread messages are known from the socket
 * only; friend requests come with the server render, then from the socket. The
 * digits are for the eye, 99+ at most; a screen reader gets the whole phrase
 * instead, with the exact count.
 */

function CountBadge({ count, label }: { count: number; label: string }) {
  return (
    // inline-flex, so the underline of a link around it does not run through it.
    <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white">
      <span aria-hidden>{badgeText(count)}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** How many messages wait unread. */
export function UnreadBadge({ count }: { count: number | undefined }) {
  const t = useTranslations('MessagesPage');

  if (count === undefined || count === 0) return null;
  return <CountBadge count={count} label={t('unread', { count })} />;
}

/** Every conversation's, for the account menu's Messages link. */
export function UnreadTotalBadge() {
  return <UnreadBadge count={useUnreadTotal()} />;
}

/** Requests waiting on you, for the account menu's Friends link. */
export function FriendPendingBadge({ rendered }: { rendered: number | undefined }) {
  const t = useTranslations('FriendsPage');
  const count = useFriendPending(rendered);

  if (count === undefined || count === 0) return null;
  return <CountBadge count={count} label={t('pending', { count })} />;
}

/**
 * The menu button's: everything behind it in one number, and each part named
 * for a screen reader ("1 friend request and 2 unread messages"). With no
 * request it reads exactly as the unread badge does.
 */
export function MenuBadge({ requests: rendered }: { requests: number | undefined }) {
  const messages = useTranslations('MessagesPage');
  const friends = useTranslations('FriendsPage');
  const format = useFormatter();
  const unread = useUnreadTotal();
  const requests = useFriendPending(rendered);
  const total = menuTotal(unread, requests);

  if (total === undefined || total === 0) return null;
  const parts = [
    requests ? friends('pending', { count: requests }) : null,
    unread ? messages('unread', { count: unread }) : null,
  ].filter((part): part is string => part !== null);
  return <CountBadge count={total} label={format.list(parts)} />;
}
