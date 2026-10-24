import { FUNCTIONS_PAGE_RULES as R, type FunctionsItem } from '../schemas/functions';

/**
 * The duration calculations of a functions lesson.
 *
 * A functions lesson has a content file, and each page of it states its
 * estimatedDurationS (and, in the exam, its timeLimitS). Nobody picks
 * these numbers: they follow FUNCTIONS_PAGE_RULES
 * (../schemas/functions.ts). The validator recomputes them here and
 * compares, to the second; the authoring kit (#83) will compute them
 * here when it writes a lesson.
 */

/**
 * The duration of a page, in seconds: the sum of its items' durations.
 * Each item type has its own rule, for example:
 *
 *   flashcards of 4 expressions = 4 × 12 s = 48 s
 *   a dialogue of 10 lines      = 20 s + 10 × 12 s = 140 s
 *
 * `exam` is true for an exam page: a word order there is a reply to build
 * (replyS), not a practice exercise (wordOrderS).
 */
export function functionsPageEstimate(items: FunctionsItem[], exam: boolean): number {
  let seconds = 0;
  for (const it of items) {
    switch (it.type) {
      case 'function_flashcards':
        seconds += it.ids.length * (it.side === 'expressions' ? R.expressionCardS : R.wordCardS);
        break;
      case 'function_dialogue':
        seconds += R.dialogueBaseS + it.lines.length * R.dialogueLineS;
        break;
      case 'function_gender_select':
        seconds += R.genderBaseS + it.ids.length * R.genderWordS;
        break;
      case 'function_matching':
        seconds += it.pairs.length * (it.side === 'expressions' ? R.expressionPairS : R.wordPairS);
        break;
      case 'function_word_order':
        seconds += exam ? R.replyS : R.wordOrderS;
        break;
      case 'function_dialogue_gap_choice':
        seconds += R.gapChoiceS;
        break;
      case 'function_listening_choice':
        seconds += R.listeningS;
        break;
      case 'function_translation_exam':
        seconds += R.translationS;
        break;
      // Every line of the exam dialogue, plus extra time for each line with a gap.
      case 'function_dialogue_gap_typing':
        seconds +=
          it.lines.length * R.examLineS + it.lines.filter((l) => l.gap).length * R.examGapS;
        break;
    }
  }
  return seconds;
}

/** The countdown of an exam page: 1.5 × its duration, rounded to the second (100 s → 150 s). */
export const functionsTimeLimit = (estimateS: number) => Math.round(estimateS * R.timeLimitFactor);
