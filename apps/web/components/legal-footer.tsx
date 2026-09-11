import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';

/**
 * The legal links, the same compact footer in every shell.
 *
 * One rich-text key rather than a sentence glued from fragments: the word order
 * and the articles around the two links differ per language, and concatenation
 * would force every translator into English syntax.
 */
export function LegalFooter() {
  const t = useTranslations('Footer');

  const link = (href: string) => (chunks: ReactNode) => (
    <Link href={href} className="underline underline-offset-4 hover:text-slate-300">
      {chunks}
    </Link>
  );

  return (
    <footer className="shrink-0 px-6 pt-2 pb-3 text-center text-[11px] text-slate-500">
      <nav aria-label={t('legalNav')}>
        {t.rich('legalSentence', { privacy: link('/privacy'), terms: link('/terms') })}
      </nav>
    </footer>
  );
}
