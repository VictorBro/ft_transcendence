import { getTranslations } from 'next-intl/server';

import { LegalFooter } from '@/components/legal-footer';
import { Shell, Wordmark } from '@/components/shell';
import { Link } from '@/i18n/navigation';
import { currentUser } from '@/lib/session';

/**
 * The 404 a reader actually sees. Every unmatched path goes through the
 * middleware first, which prefixes it with a locale, so it lands in [...rest]
 * next door and renders here: translated, with the legal links the subject
 * requires to be reachable from wherever the reader is.
 *
 * It reads the session for its two links, as the other shells do (#224): a
 * signed-in user who mistypes a URL goes back to the app, a visitor to the
 * start page. That makes every 404 a dynamic render, on purpose: a link home
 * that throws a signed-in user out is worth more than a static 404.
 */
export default async function LocaleNotFound() {
  const t = await getTranslations('NotFoundPage');
  const home = (await currentUser()) === null ? '/' : '/learn';

  return (
    <Shell brand={<Wordmark href={home} />} footer={<LegalFooter />}>
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{t('heading')}</h1>
        <p className="max-w-md text-slate-400">{t('intro')}</p>
        <Link
          href={home}
          className="mt-2 rounded-full bg-indigo-700 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-800"
        >
          {t('goHome')}
        </Link>
      </div>
    </Shell>
  );
}
