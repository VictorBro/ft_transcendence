import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LanguageSchema } from '@ft/shared';

import { loadPlacement } from '@/lib/placement';
import { requireUser } from '@/lib/session';
import { PlacementExam } from './placement-exam';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Placement' });
  return { title: t('title') };
}

export default async function PlacementPage({ params }: { params: Promise<{ lang: string }> }) {
  await requireUser();

  const { lang } = await params;

  const parsed = LanguageSchema.safeParse(lang);
  if (!parsed.success) {
    notFound();
  }

  const result = await loadPlacement();

  if (result.status === 'signed-out') {
    throw new Error('Could not verify the session');
  }

  if (result.status === 'unavailable') {
    throw new Error(`Could not load placement: ${result.reason}`);
  }

  return <PlacementExam lang={parsed.data} initial={result.status === 'ok' ? result.data : null} />;
}
