import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { requireUser } from '@/lib/session';
import { TwoFactorPanel } from './two-factor-panel';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('TwoFactorPage');

  return { title: t('heading') };
}

export const dynamic = 'force-dynamic';

export default async function TwoFactorPage() {
  // requireUser first: the panel below decides what to show from the status, and
  // a signed-out visitor should land on /login rather than on an empty page.
  await requireUser();
  const t = await getTranslations('TwoFactorPage');

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('heading')}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">{t('intro')}</p>
      </div>
      <TwoFactorPanel />
    </div>
  );
}
