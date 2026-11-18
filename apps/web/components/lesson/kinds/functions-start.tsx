import { useLocale } from 'next-intl';

import { pick } from '@/lib/localized';
import type { StartField } from '../types';

/**
 * The situation under the minutes: of a functions dialogue, and of a
 * reading lesson's document (#148).
 */
export const Situation: StartField = function Situation({ outline }) {
  const locale = useLocale();
  if (!outline.situation) return null;
  return <p className="lesson-situation text-slate-400">{pick(outline.situation, locale)}</p>;
};
