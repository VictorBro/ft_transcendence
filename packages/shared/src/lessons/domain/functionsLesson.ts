import {
  FUNCTIONS_PAGE_RULES as R,
  type FunctionsBrief,
  type FunctionsItem,
} from '../schemas/functions';

/**
 * Page rules of function lessons (SPEC section 8, "Page rules"). The lesson content stores page
 * estimates and exam limits; validation and the authoring tool compute them with these rules.
 */

/** Estimated seconds of a page from its items; exam pages are built from the exam item types. */
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
      case 'function_dialogue_gap_typing':
        seconds +=
          it.lines.length * R.examLineS + it.lines.filter((l) => l.gap).length * R.examGapS;
        break;
    }
  }
  return seconds;
}

/** Countdown of an exam page: 1.5 times its estimate, rounded to seconds. */
export const functionsTimeLimit = (estimateS: number) => Math.round(estimateS * R.timeLimitFactor);

/** Display text of an expression: sentence starts get a trailing " …". */
export const expressionDisplay = (e: { text: string; openEnd: boolean }) =>
  e.openEnd ? `${e.text} …` : e.text;

/** Expressions and words of a brief by ID, with their French display text. */
export function functionsTerms(brief: FunctionsBrief) {
  return new Map<
    string,
    {
      display: string;
      translations: Partial<Record<string, string[]>>;
      kind: 'expression' | 'word';
    }
  >([
    ...brief.expressions.map(
      (e) =>
        [
          e.id,
          {
            display: expressionDisplay(e),
            translations: e.translations,
            kind: 'expression' as const,
          },
        ] as const,
    ),
    ...brief.words.map(
      (w) =>
        [
          w.id,
          { display: w.teachingForm, translations: w.translations, kind: 'word' as const },
        ] as const,
    ),
  ]);
}
