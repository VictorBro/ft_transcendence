import type { Language } from '../../schemas/language';
import type { Gender } from '../schemas/vocabulary';

/**
 * The articles of each course language.
 *
 *   lang  a noun is taught and examined as      a term or a typed gap never starts with
 *   fr    un / une / des livre (D39)            le, la, l', les, un, une, des
 *   de    der / die / das Tisch, die (plural)   der, die, das, den, dem, des,
 *                                               ein, eine, einen, einem, einer, eines
 *   en    book: no article                      a, an, the
 */

/** true when the course language's nouns have a gender: fr and de, not en. */
export const hasGender = (lang: Language) => lang === 'fr' || lang === 'de';

/** The genders a noun of the course language can have: fr masculine or feminine, de also neuter. */
export const nounGenders = (lang: Language) =>
  Object.keys(TEACHING_ARTICLES[lang]?.singular ?? {}) as Gender[];

interface TeachingArticles {
  /** How the messages name it: "indefinite article un/une/des". */
  label: string;
  /** The article of a singular noun, per gender. */
  singular: Partial<Record<Gender, string>>;
  /** The article of a plural noun. */
  plural: string;
}

/** The article a noun is taught with; null when the language needs none. */
export const TEACHING_ARTICLES: Record<Language, TeachingArticles | null> = {
  fr: {
    label: 'indefinite article un/une/des',
    singular: { masculine: 'un', feminine: 'une' },
    plural: 'des',
  },
  de: {
    label: 'definite article der/die/das',
    singular: { masculine: 'der', feminine: 'die', neuter: 'das' },
    plural: 'die',
  },
  en: null,
};

/** The articles a term or a typed gap answer must not start with. */
export const STRIPPED_ARTICLES: Record<Language, readonly string[]> = {
  fr: ['le', 'la', "l'", 'les', 'un', 'une', 'des'],
  de: ['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines'],
  en: ['a', 'an', 'the'],
};

/** The teaching article `form` starts with: "der Tisch" → "der"; "Tisch" → undefined. */
export function teachingArticle(lang: Language, form: string): string | undefined {
  const t = TEACHING_ARTICLES[lang];
  if (!t) return undefined;
  return [...Object.values(t.singular), t.plural].find((a) => form.startsWith(`${a} `));
}

const lower = (s: string) => s.toLowerCase().replace(/[’ʼ]/g, "'");

/** true when `text` is an article followed by a word: "le livre", "l'école", "the book". */
export const startsWithArticle = (lang: Language, text: string) =>
  STRIPPED_ARTICLES[lang].some((a) =>
    a.endsWith("'") ? lower(text).startsWith(a) : lower(text).startsWith(`${a} `),
  );

/** true when `text` is an article alone: "un", "die". */
export const isArticle = (lang: Language, text: string) =>
  STRIPPED_ARTICLES[lang].includes(lower(text));
