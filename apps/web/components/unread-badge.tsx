'use client';

import { useTranslations } from 'next-intl';

import { useUnreadTotal } from './tab-socket';

/**
 * How many messages wait unread. Nothing at 0, nor before the tab has heard,
 * so a 0 never flashes on first paint. The digit is for the eye; a screen
 * reader gets the whole phrase instead.
 */
export function UnreadBadge({ count }: { count: number | undefined }) {
  const t = useTranslations('MessagesPage');

  if (count === undefined || count === 0) return null;
  return (
    // inline-flex, so the underline of a link around it does not run through it.
    <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white">
      <span aria-hidden>{count}</span>
      <span className="sr-only">{t('unread', { count })}</span>
    </span>
  );
}

/** Every conversation's, for the account menu's Messages link. */
export function UnreadTotalBadge() {
  return <UnreadBadge count={useUnreadTotal()} />;
}
