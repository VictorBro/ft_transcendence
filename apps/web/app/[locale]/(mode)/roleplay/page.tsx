import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ComingSoon } from '@/components/coming-soon';
import { requireUser } from '@/lib/session';

// The tab title and the placeholder read the same Lobby key as the tile that
// links here, so the three cannot drift apart.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Lobby' });

  return { title: t('roleplayTitle') };
}

export const dynamic = 'force-dynamic';

export default async function RoleplayPage() {
  await requireUser();
  const t = await getTranslations('Lobby');

  return <ComingSoon title={t('roleplayTitle')} />;
}
