import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { requireUser } from '@/lib/session';
import { ProfileForm } from '../profile-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ProfileForm');

  return { title: t('editProfile') };
}

// Renders one specific person's data, so it must never be prerendered or cached.
export const dynamic = 'force-dynamic';

export default async function EditProfilePage() {
  const user = await requireUser();

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-8">
      <ProfileForm user={user} />
    </div>
  );
}
