import { useTranslations } from 'next-intl';

import type { StartField } from '../types';

/** The vocabulary field of the lesson page: how many words the lesson teaches. */
export const WordCount: StartField = function WordCount({ outline }) {
  const t = useTranslations('Lesson');
  if (outline.words === undefined) return null;
  return <p className="-mt-2 text-slate-400">{t('wordCount', { count: outline.words })}</p>;
};
