import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { requireUser } from '@/lib/session';
import { Link } from '@/i18n/navigation';
import { Avatar } from '@/components/avatar';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ProfilePage');

  return { title: t('title') };
}

// Renders one specific person's data, so it must never be prerendered or cached.
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await requireUser();
  const locale = await getLocale();
  const t = await getTranslations('ProfilePage');
  const joinedDate = new Date(user.createdAt).toLocaleDateString(locale);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-10">
      <section className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{user.displayName}</h1>
          <p className="text-sm text-slate-300">{user.email}</p>
          <p className="text-sm text-slate-400">{t('joined', { date: joinedDate })}</p>
          <Link href="/profile/edit" className="text-sm underline underline-offset-4">
            {t('editProfile')}
          </Link>
        </div>
        <Avatar src={user.avatarUrl} name={user.displayName} size={128} />
      </section>

      <section className="flex flex-col gap-3 border-t border-slate-800 pt-8">
        <h2 className="text-lg font-medium">{t('security')}</h2>
        <p className="text-sm text-slate-300">{t('twoFactorPrompt')}</p>
        <Link href="/settings/2fa" className="text-sm underline underline-offset-4">
          {t('twoFactorAuthentication')}
        </Link>
      </section>
    </div>
  );
}
