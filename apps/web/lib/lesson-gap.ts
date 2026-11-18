import type { Language } from '@ft/shared';

/**
 * Whether the text after a gap starts with a mark that takes no space
 * before it: "Je lis un ___." A French "?", "!", ";" or ":" keeps its
 * space ("Ça va ___ ?").
 */
export function gluedAfter(after: string | undefined, lang: Language): boolean {
  if (!after) return false;
  return /^[.,…)]/u.test(after) || (lang !== 'fr' && /^[?!;:]/u.test(after));
}
