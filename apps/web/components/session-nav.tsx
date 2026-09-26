import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { currentUser } from '@/lib/session';
import { Avatar } from './avatar';
import { LogOutButton } from './log-out-button';

/**
 * Server component, so the first paint already knows who is signed in. Doing
 * this in the browser would flash the signed-out nav on every page load.
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

  return (
    <nav aria-label={t('accountNav')} className="flex min-w-0 items-center gap-4 text-sm">
      <Link
        href="/profile"
        className="flex min-w-0 items-center gap-4 underline underline-offset-4"
      >
        <Avatar src={user.avatarUrl} name={user.displayName} size={24} />
        {/* The name where there is room for it. A display name may be 32
            characters with nothing to break on, which on a phone leaves the
            rest of the row nothing, and truncating it to three letters tells
            the reader less than naming the destination does. The avatar alone
            would not read as a link. */}
        <span className="truncate max-sm:hidden">{user.displayName}</span>
        <span className="sm:hidden">{t('profile')}</span>
      </Link>
      <LogOutButton />
    </nav>
  );
}
