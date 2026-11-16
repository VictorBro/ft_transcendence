/** A text in en, fr and de, read in the interface language; English for any other. */
export function pick(text: { en: string; fr: string; de: string }, locale: string): string {
  return locale === 'fr' || locale === 'de' ? text[locale] : text.en;
}

/** A text in the course's native languages only: the interface language, else the first there is. */
export function pickNative(
  text: { en?: string; fr?: string; de?: string },
  locale: string,
): string {
  const own = (text as Record<string, string | undefined>)[locale];
  return own ?? text.en ?? text.fr ?? text.de ?? '';
}
