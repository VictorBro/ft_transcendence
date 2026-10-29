import type { Locale } from '../../schemas/locale';
import {
  TRUE_FALSE_LABELS,
  type ReadingBrief,
  type ReadingContent,
  type ReadingItem,
} from '../schemas/reading';
import { known } from './kinds/kind';
import type { Option, PlanUnit } from './plan';

/**
 * The units of a reading lesson. The documents and the flashcards are
 * presentation only; every matching row, question and ordering task is
 * one unit.
 */

/** The pieces of an ordering task are whole sentences: their order reads first → last. */
export const ORDER_SEPARATOR = ' → ';

/** The key words of a brief by id. */
export const readingKeywords = (brief: ReadingBrief) =>
  new Map(brief.keywords.map((k) => [k.id, k]));

export function readingUnits(
  brief: ReadingBrief,
  content: ReadingContent,
  motherTongue: Locale,
): (item: ReadingItem, id: (suffix?: string) => string) => PlanUnit[] {
  const keywords = readingKeywords(brief);
  const learning = (options: { optionId: string; text: string }[]): Option[] =>
    options.map((o) => ({ id: o.optionId, text: o.text, lang: 'learning' }));
  // The first meaning in the mother tongue.
  const keyword = (id: string) => known(keywords.get(id), `Key word ${id}`);
  const meaning = (id: string) =>
    known(keyword(id).translations[motherTongue]?.[0], `The ${motherTongue} translation of ${id}`);

  return (item, id) => {
    const base = { itemId: item.itemId, itemType: item.type };
    switch (item.type) {
      case 'reading_keyword_matching': {
        // As vocabulary matching: the meaning on one side, the key word on the other.
        const options = item.keywordIds.map((k) => ({
          id: k,
          text: meaning(k),
          lang: 'native' as const,
        }));
        return item.keywordIds.map((k) => ({
          ...base,
          kind: 'choice',
          id: id(`/${k}`),
          prompt: { learning: keyword(k).term },
          options,
          correct: [k],
          explanation: keyword(k).explanation,
          answer: meaning(k),
          answerLang: 'native',
        }));
      }
      case 'reading_skim_choice':
      case 'reading_choice':
        return [
          {
            ...base,
            kind: 'choice',
            id: id(),
            prompt: { learning: item.question },
            options: learning(item.options),
            correct: [item.answerOptionId],
            explanation: item.answerExplanation,
            answer: item.options.find((o) => o.optionId === item.answerOptionId)?.text ?? '',
            answerLang: 'learning',
          },
        ];
      case 'reading_true_false': {
        // True and false in the course language, in that order.
        const labels = TRUE_FALSE_LABELS[content.lang] ?? TRUE_FALSE_LABELS.en;
        return [
          {
            ...base,
            kind: 'choice',
            id: id(),
            prompt: { learning: item.statement },
            options: (['true', 'false'] as const).map((o) => ({
              id: o,
              text: labels[o],
              lang: 'learning',
            })),
            correct: [item.answer],
            explanation: item.answerExplanation,
            answer: labels[item.answer],
            answerLang: 'learning',
          },
        ];
      }
      case 'reading_order': {
        const tokens = item.pieces.map((p) => ({
          id: p.pieceId,
          text: p.text,
          lang: 'learning' as const,
        }));
        return [
          {
            ...base,
            kind: 'order',
            id: id(),
            prompt: {},
            tokens,
            acceptedOrders: item.acceptedOrders,
            explanation: item.answerExplanation,
            answer: item.acceptedOrders[0]
              .map((t) => tokens.find((x) => x.id === t)?.text ?? '')
              .join(ORDER_SEPARATOR),
            answerLang: 'learning',
          },
        ];
      }
      case 'reading_flashcards':
      case 'reading_document':
        return [];
    }
  };
}
