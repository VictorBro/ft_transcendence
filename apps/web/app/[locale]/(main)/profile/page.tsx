import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { requireUser } from '@/lib/session';
import { Link } from '@/i18n/navigation';
import { ProfileForm } from './profile-form';

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
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{user.displayName}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">{user.email}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t('joined', { date: joinedDate })}
        </p>
      </section>

      <ProfileForm user={user} />

      <section className="flex flex-col gap-3 border-t border-slate-200 pt-8 dark:border-slate-800">
        <h2 className="text-lg font-medium">{t('security')}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">{t('twoFactorPrompt')}</p>
        <Link href="/settings/2fa" className="text-sm underline underline-offset-4">
          {t('twoFactorAuthentication')}
        </Link>
      </section>
    </div>
  );
}
