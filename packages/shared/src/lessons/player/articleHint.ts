import { normalizeAnswer } from './score';

/**
 * The article hint of a translation exam: the question says whether the
 * answer starts with an article, so "livre" for "un livre" is not a
 * surprise in the results. French only for now; another course language
 * gets no hint.
 */
const ARTICLES: Record<string, { indefinite: RegExp; definite: RegExp }> = {
  fr: { indefinite: /^(un|une|des)\s/iu, definite: /^(le|la|les)\s|^l'/iu },
};

/** true when `text` starts with an article of `lang`. */
export function startsWithArticle(text: string, lang: string): boolean {
  return articleHint(text, lang) !== null;
}

/** Which article `text` starts with: indefinite (un, une, des), definite (le, la, les, l'), or none. */
export function articleHint(text: string, lang: string): 'indefinite' | 'definite' | null {
  const rules = ARTICLES[lang];
  if (!rules) return null;
  const t = normalizeAnswer(text);
  if (rules.indefinite.test(t)) return 'indefinite';
  return rules.definite.test(t) ? 'definite' : null;
}
