import { useTranslations } from 'next-intl';

import type { StartField } from '../types';

/**
 * The reading field of the lesson page: "5 key words", under the
 * situation, as on the screen. Never the genre: the skim question can ask
 * it.
 */
export const KeyWords: StartField = function KeyWords({ outline }) {
  const t = useTranslations('Lesson');
  if (outline.kind !== 'reading' || !outline.words) return null;
  return (
    <p className="lesson-situation text-slate-400">{t('keyWordCount', { count: outline.words })}</p>
  );
};
