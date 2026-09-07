import { useTranslations } from 'next-intl';

import { LegalFooter } from '@/components/legal-footer';
import { Shell, Wordmark } from '@/components/shell';
import { Link } from '@/i18n/navigation';

/**
 * The 404 a reader actually sees. Every unmatched path goes through the
 * middleware first, which prefixes it with a locale, so it lands in [...rest]
 * next door and renders here — translated, with the legal links the subject
 * requires to be reachable from wherever the reader is.
 *
 * No account nav: this is rendered for unmatched paths and must not read
 * cookies, which would make every 404 a dynamic render.
 */
export default function LocaleNotFound() {
  const t = useTranslations('NotFoundPage');

  return (
    <Shell brand={<Wordmark />} footer={<LegalFooter />}>
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{t('heading')}</h1>
        <p className="max-w-md text-slate-400">{t('intro')}</p>
        <Link
          href="/"
          className="mt-2 rounded-full bg-indigo-700 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-800"
        >
          {t('goHome')}
        </Link>
      </div>
    </Shell>
  );
}
