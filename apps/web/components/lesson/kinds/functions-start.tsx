import { useLocale } from 'next-intl';

import { pick } from '@/lib/localized';
import type { StartField } from '../types';

/** The functions field of the lesson page: the situation of the dialogue, under the minutes. */
export const Situation: StartField = function Situation({ outline }) {
  const locale = useLocale();
  if (!outline.situation) return null;
  return <p className="lesson-situation text-slate-400">{pick(outline.situation, locale)}</p>;
};
