import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';

/**
 * The legal links, in the two densities the shells need. `full` is for pages
 * that can spend the space; the default is for the pinned app shells, where the
 * chat view wants every pixel.
 *
 * One rich-text key rather than a sentence glued from fragments: the word order
 * and the articles around the two links differ per language, and concatenation
 * would force every translator into English syntax.
 */
export function LegalFooter({ full = false }: { full?: boolean }) {
  const t = useTranslations('Footer');

  const link = (href: string) => (chunks: React.ReactNode) => (
    <Link href={href} className="underline underline-offset-4 hover:text-slate-300">
      {chunks}
    </Link>
  );

  return (
    <footer
      className={
        full
          ? 'border-t border-slate-800 px-6 py-6 text-center text-sm text-slate-400'
          : 'shrink-0 px-6 pt-0 pb-4 text-center text-[11px] text-slate-500'
      }
    >
      <nav aria-label={t('legalNav')}>
        {t.rich('legalSentence', { privacy: link('/privacy'), terms: link('/terms') })}
      </nav>
    </footer>
  );
}
