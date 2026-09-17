import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { requireUser } from '@/lib/session';
import { ProfileForm } from './profile-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ProfilePage');

  return { title: t('editProfile') };
}

// Renders one specific person's data, so it must never be prerendered or cached.
export const dynamic = 'force-dynamic';

export default async function EditProfilePage() {
  const user = await requireUser();
  const t = await getTranslations('ProfilePage');

  // Heading here, not in ProfileForm, so the page has an h1 and the form stays a
  // form. One key feeds the link on /profile, this title and this heading.
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-10">
      <div className="flex flex-col gap-2">
        <Link href="/profile" className="text-sm underline underline-offset-4">
          {t('backToProfile')}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{t('editProfile')}</h1>
      </div>
      <ProfileForm user={user} />
    </div>
  );
}
