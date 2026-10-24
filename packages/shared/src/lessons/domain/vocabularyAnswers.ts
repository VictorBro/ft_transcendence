import { nativeLocales } from '../schemas/artifactCommon';
import type { Locale } from '../../schemas/locale';
import type { VocabularyTarget } from '../schemas/vocabulary';

/**
 * The answers fully accepted for a word in a vocabulary exam: its
 * examForms, plus its genderVariants when the question does not say
 * which gender or number it wants.
 *
 * Example: examForms ["un serveur"], genderVariants ["une serveuse"],
 * first translation "waiter".
 * - asked "waiter": the question does not say which gender, so
 *   "un serveur" and "une serveuse" are both accepted;
 * - asked "waiter (masculine singular form)" (its examPrompt): only
 *   "un serveur".
 *
 * How it decides: the question is "hinted" when, in every language the
 * course translates into, it differs from the word's first translation.
 * No `prompt` (the dictation, which has no question to read) also
 * counts as hinted: only the examForms.
 *
 * new Set removes duplicates. An answer that is almost right (a missing
 * accent, a capital) is not handled here: grading belongs to the lesson
 * player (Milestone 3).
 */
export function vocabularyExamAnswers(
  target: VocabularyTarget,
  lang: string,
  prompt?: Partial<Record<Locale, string>>,
): string[] {
  const hinted =
    !prompt || nativeLocales(lang).every((l) => prompt[l] !== target.translations[l]?.[0]);
  return [...new Set([...target.examForms, ...(hinted ? [] : target.genderVariants)])];
}
