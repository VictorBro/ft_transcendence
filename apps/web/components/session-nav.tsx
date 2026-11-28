import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { friendPending } from '@/lib/friends';
import { currentUser } from '@/lib/session';
import { Avatar } from './avatar';
import { ConnectionStatus } from './connection-status';
import { LogOutButton } from './log-out-button';
import { MENU_ROW, MenuIcon } from './menu-icon';
import { FriendPendingBadge, UnreadTotalBadge } from './unread-badge';

/**
 * Server component, so the first paint already knows who is signed in. Doing
 * this in the browser would flash the signed-out nav on every page load.
 *
 * It sits in every shell's header and never on an error page or the 404, so it
 * also opens the tab's live connection, which is why only the signed-in branch
 * renders ConnectionStatus.
 */
export async function SessionNav() {
  const user = await currentUser();
  const t = await getTranslations('SessionNav');

  if (user === null) {
    return (
      <nav aria-label={t('accountNav')} className="flex items-center gap-4 text-sm">
        <Link href="/login" className="underline underline-offset-4">
          {t('signIn')}
        </Link>
        <Link href="/signup" className="underline underline-offset-4">
          {t('createAccount')}
        </Link>
      </nav>
    );
  }

  const friends = await getTranslations('FriendsPage');
  const messages = await getTranslations('MessagesPage');
  // The same call as the menu button's: cache() makes it one per render.
  const requests = await friendPending();

  return (
    <>
      <ConnectionStatus />
      <nav
        aria-label={t('accountNav')}
        className="mt-1 flex min-w-0 flex-col gap-0.5 border-t border-slate-800 pt-2"
      >
        <Link href="/profile" className={MENU_ROW}>
          <Avatar src={user.avatarUrl} name={user.displayName} size={24} />
          {/* The name, truncated: a display name may be 32 characters with
            nothing to break on, and the row is as wide as the menu. */}
          <span className="truncate">{user.displayName}</span>
        </Link>
        {/* Each count at its row's end, where a menu shows one. */}
        <Link href="/friends" className={MENU_ROW}>
          <MenuIcon name="friends" />
          {friends('title')}
          <span className="ml-auto flex">
            <FriendPendingBadge rendered={requests} />
          </span>
        </Link>
        <Link href="/chat" className={MENU_ROW}>
          <MenuIcon name="messages" />
          {messages('title')}
          <span className="ml-auto flex">
            <UnreadTotalBadge />
          </span>
        </Link>
        <div aria-hidden className="my-1 border-t border-slate-800" />
        <LogOutButton />
      </nav>
    </>
  );
}
