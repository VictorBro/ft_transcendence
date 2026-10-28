import { learningForms, parseRichText, richTextShape } from '../domain/richText';
import type { Issues } from './issues';

/**
 * The small checks and helpers that several kinds of lesson share.
 */

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** true when a and b hold the same values, as many times each, in any order. */
export const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000');

/**
 * A lesson's estimatedMinutes is not chosen: it is the sum of its pages'
 * durations, rounded to the minute, and at least 1 (500 s → 8 min).
 */
export function checkMinutes(estimatedMinutes: number, seconds: number, issues: Issues) {
  const expected = Math.max(1, Math.round(seconds / 60));
  issues.check(
    estimatedMinutes === expected,
    'estimatedMinutes',
    `must equal the summed page estimates rounded to minutes (${expected})`,
  );
}

/* ============================================================ explanations */

/**
 * An explanation that only shows the character, such as "written with
 * an é", instead of naming the mark ("with an accent aigu"). A learner
 * who does not see the difference between e and é is not helped by it.
 */
export const CHARACTER_ONLY = /\bwritten with (an? )?[àâäçéèêëîïôöûùüÿœæ](?![\p{L}])/iu;

/** Adds an issue when an explanation (its English text) names only the character. */
export function checkMarkNamed(
  text: { en: string } | null | undefined,
  path: string,
  issues: Issues,
) {
  if (text && CHARACTER_ONLY.test(text.en))
    issues.add(
      path,
      `explanation "${text.en}" must name the mark (accent aigu, cédille, umlaut…), not only the character`,
    );
}

/** The same check on the answerExplanation of each item or row that has one. */
export function checkExplanations(
  items: { answerExplanation?: { en: string } }[],
  path: string,
  issues: Issues,
) {
  for (const it of items) checkMarkNamed(it.answerExplanation, path, issues);
}

/**
 * A long teaching text (a vocabulary group's introduction, a grammar
 * explanation) is written in the simple Markdown of ../domain/richText.ts,
 * once per locale. Each version must parse, and the versions must match:
 * the same paragraphs and lists, and the same `forms` in the language
 * being learned. Only the explanation around the forms is translated.
 *
 *   en: "These nouns are **masculine**: `un livre`."
 *   de: "Diese Nomen sind **maskulin**: `un livre`."   ✓ same shape, same form
 */
export function checkRichText(text: Record<string, string>, path: string, issues: Issues) {
  const versions = Object.entries(text).map(([locale, value]) => ({
    locale,
    ...parseRichText(value),
  }));
  for (const v of versions)
    for (const e of v.errors) issues.add(`${path}.${v.locale}`, `${e} (restricted Markdown)`);

  const [first, ...rest] = versions;
  if (!first) return;
  const firstShape = richTextShape(first.blocks);
  const firstForms = learningForms(first.blocks);
  const list = (forms: string[]) => forms.map((f) => `\`${f}\``).join(', ') || 'none';
  for (const v of rest) {
    const shape = richTextShape(v.blocks);
    const forms = learningForms(v.blocks);
    issues.check(
      shape === firstShape,
      `${path}.${v.locale}`,
      `block structure ${shape} differs from ${first.locale} (${firstShape})`,
    );
    issues.check(
      sameSet(forms, firstForms),
      `${path}.${v.locale}`,
      `learning-language forms differ from ${first.locale}: ${list(forms)} vs ${list(firstForms)}`,
    );
  }
}
