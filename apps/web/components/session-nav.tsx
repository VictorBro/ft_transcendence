import { Link } from '@/i18n/navigation';
import { currentUser } from '@/lib/session';
import { LogOutButton } from './log-out-button';
import { getTranslations } from 'next-intl/server';

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
    <nav aria-label={t('accountNav')} className="flex items-center gap-4 text-sm">
      <Link href="/profile" className="underline underline-offset-4">
        {user.displayName}
      </Link>
      <LogOutButton />
    </nav>
  );
}
