import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';

/**
 * Minimal footer for the app shells. The (main) marketing shell keeps its own
 * larger footer; here the chat and mode pages need the legal links reachable
 * without spending vertical space the conversation view wants.
 *
 * One rich-text key rather than a sentence glued together from fragments: word
 * order around the two links differs per language, and concatenation would
 * force every translator into English syntax.
 */
export function LegalFooter() {
  const t = useTranslations('Footer');

  return (
    <footer className="shrink-0 px-6 pt-0 pb-4 text-center text-[11px] text-slate-500">
      <nav aria-label={t('legalNav')}>
        {t.rich('legalSentence', {
          privacy: (chunks) => (
            <Link href="/privacy" className="underline underline-offset-4 hover:text-slate-300">
              {chunks}
            </Link>
          ),
          terms: (chunks) => (
            <Link href="/terms" className="underline underline-offset-4 hover:text-slate-300">
              {chunks}
            </Link>
          ),
        })}
      </nav>
    </footer>
  );
}
