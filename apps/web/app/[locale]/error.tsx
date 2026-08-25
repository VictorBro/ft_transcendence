'use client';

import { useTranslations } from 'next-intl';

import { LegalFooter } from '@/components/legal-footer';
import { Shell, Wordmark } from '@/components/shell';
import { Link } from '@/i18n/navigation';

/**
 * Where requireUser() lands when the API cannot be reached.
 *
 * That throw is deliberate: a rate-limited or restarting API must not look like
 * a logout, so the session cookie is left alone and the visitor can simply try
 * again. Without this boundary Next answers with its own unstyled 500, which
 * has no nav and no way back, trading a wrong redirect for a dead end.
 *
 * Inside [locale], so it is translated and the provider from the layout above
 * is in reach. global-error.tsx stays English on purpose: it catches what
 * throws in that layout, which is where the catalogue is loaded.
 *
 * No account nav here: the session lookup is precisely what failed.
 */
export default function LocaleErrorBoundary({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('ErrorPage');

  return (
    <Shell brand={<Wordmark />} footer={<LegalFooter />}>
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{t('heading')}</h1>
        <p className="max-w-md text-slate-400">{t('intro')}</p>
        <div className="mt-2 flex items-center gap-4 text-sm">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-indigo-700 px-6 py-2 font-semibold text-white transition-colors hover:bg-indigo-800"
          >
            {t('tryAgain')}
          </button>
          <Link href="/" className="underline underline-offset-4 hover:text-slate-100">
            {t('goHome')}
          </Link>
        </div>
      </div>
    </Shell>
  );
}
