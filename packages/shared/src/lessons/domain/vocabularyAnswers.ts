import { nativeLocales } from '../schemas/artifactCommon';
import type { Locale } from '../../schemas/locale';
import type { VocabularyTarget } from '../schemas/vocabulary';

/**
 * The single rule for fully correct vocabulary exam answers: the target's exam forms, plus its
 * gender/number variants when a translation prompt does not say which one is meant. Every other
 * answer is graded by the shared classifier (accents or capitals only: 50 %, D25/D40).
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
