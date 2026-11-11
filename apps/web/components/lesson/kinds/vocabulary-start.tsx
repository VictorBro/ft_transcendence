import type { StartFact } from '../types';

/** The vocabulary fact of the lesson page, after the minutes: "About 14 minutes · 8 words". */
export const wordCount: StartFact = (outline, t) =>
  outline.words ? t('wordCount', { count: outline.words }) : null;
