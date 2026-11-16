'use client';

import { useTranslations } from 'next-intl';

import { useFriendOnline } from './tab-socket';

/**
 * A friend's dot: green while they are online, grey when they are not.
 *
 * A client component, because it must change without a reload. It reads the
 * tab's presence map, which outlives the page: a page Next restores from its
 * client cache on Back, or a refresh rendered before an update that lands
 * after it, still shows the latest news. `online`, the value the server
 * rendered, counts only until the tab has heard about this friend.
 */
export function PresenceDot({ userId, online }: { userId: string; online: boolean }) {
  const t = useTranslations('FriendsPage');
  const live = useFriendOnline(userId, online);

  return (
    // role="img" with a label: a screen reader says "Online" or "Offline"
    // instead of a colour it cannot see. The ring, the page's own background,
    // sets the dot apart from the avatar it sits on. shrink-0: an empty flex
    // item may shrink to nothing, and a long name beside it would squeeze it
    // into a thin pill.
    <span
      role="img"
      aria-label={t(live ? 'online' : 'offline')}
      className={`size-3 shrink-0 rounded-full ring-2 ring-slate-950 ${live ? 'bg-green-500' : 'bg-slate-500'}`}
    />
  );
}
