import type { StartFact } from '../types';

/**
 * The vocabulary fact of the lesson page, after the minutes: "About 14
 * minutes · 8 words". A reading lesson's `words` are its key words, shown
 * on their own line (reading-start.tsx).
 */
export const wordCount: StartFact = (outline, t) =>
  outline.kind === 'vocabulary' && outline.words ? t('wordCount', { count: outline.words }) : null;
