import { normalizeAnswer } from './score';

/**
 * The article hint of a translation exam: the question says whether the
 * answer starts with an article, so "livre" for "un livre" is not a
 * surprise in the results. Every course language has its rules: a German
 * exam answer is "der Buchstabe", and a few English ones start with "the".
 */
const ARTICLES: Record<string, { indefinite: RegExp; definite: RegExp }> = {
  fr: { indefinite: /^(un|une|des)\s/iu, definite: /^(le|la|les)\s|^l'/iu },
  de: {
    indefinite: /^(ein|eine|einen|einem|einer|eines)\s/iu,
    definite: /^(der|die|das|den|dem|des)\s/iu,
  },
  en: { indefinite: /^(a|an)\s/iu, definite: /^the\s/iu },
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
