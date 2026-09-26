import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ComingSoon } from '@/components/coming-soon';
import { requireUser } from '@/lib/session';

// The tab title and the placeholder read the same Modes key as the link that
// links here, so the three cannot drift apart.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Modes' });

  return { title: t('friendsTitle') };
}

export const dynamic = 'force-dynamic';

export default async function FriendsPage() {
  await requireUser();
  const t = await getTranslations('Modes');

  return <ComingSoon title={t('friendsTitle')} />;
}
