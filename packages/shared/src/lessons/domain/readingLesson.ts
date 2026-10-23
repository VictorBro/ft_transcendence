import type { Level } from '../../schemas/item';
import type { ReadingDocument, ReadingItem } from '../schemas/reading';

/**
 * Page rules of reading lessons (SPEC section 9, "Page rules"). The lesson content stores page
 * estimates, `skimSeconds` and the exam limit; validation and the authoring tool compute them here.
 */
export const READING_PAGE_RULES = {
  keywordCardS: 10,
  keywordPairS: 10,
  /** The skim question after the document is put away. */
  skimQuestionS: 20,
  detailQuestionS: 30,
  orderPieceS: 15,
  examQuestionS: 20,
  timeLimitFactor: 1.5,
  /** Skim times and exam limits are rounded up to this step. */
  roundS: 5,
} as const;

/** Skim speed per level in words per minute (section 9). Starting values, tuned in P5-05. */
export const READING_SKIM_WPM: Record<Level, number> = {
  A1: 75,
  A2: 90,
  B1: 110,
  B2: 130,
  C1: 150,
  C2: 170,
};

const roundUp = (seconds: number) =>
  Math.ceil(seconds / READING_PAGE_RULES.roundS) * READING_PAGE_RULES.roundS;

/** Words of a text: whitespace-separated tokens with at least one letter or digit ("l'heure" is one, "€" none). */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

/** A letter or digit: a highlight must not start or end inside a longer word ("Entrée" not in "Entrées"). */
const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * Where the highlighted key words occur in a paragraph as whole words, left to right; at one position
 * the longer highlight wins and overlapping occurrences are skipped.
 */
export function highlightRanges(text: string, words: string[]): { at: number; word: string }[] {
  const found: { at: number; word: string }[] = [];
  for (const word of words) {
    for (let at = text.indexOf(word); at >= 0 && word; at = text.indexOf(word, at + 1)) {
      if (!WORD_CHAR.test(text[at - 1] ?? '') && !WORD_CHAR.test(text[at + word.length] ?? ''))
        found.push({ at, word });
    }
  }
  found.sort((a, b) => a.at - b.at || b.word.length - a.word.length);
  const ranges: typeof found = [];
  for (const range of found) {
    const last = ranges.at(-1);
    if (!last || range.at >= last.at + last.word.length) ranges.push(range);
  }
  return ranges;
}

/** Words of everything a document shows: title, meta lines and paragraphs. */
export function documentWords(doc: Pick<ReadingDocument, 'title' | 'meta' | 'paragraphs'>): number {
  return [doc.title, ...doc.meta, ...doc.paragraphs].reduce(
    (n, text) => n + (text ? countWords(text) : 0),
    0,
  );
}

/** Seconds to read `words` at the skim speed of the level, unrounded. */
const readingTime = (words: number, level: Level) => (words * 60) / READING_SKIM_WPM[level];

/** Skim time of the main document: its word count at the skim speed, rounded up to 5 s, at least 15 s. */
export function readingSkimSeconds(
  doc: Pick<ReadingDocument, 'title' | 'meta' | 'paragraphs'>,
  level: Level,
): number {
  return Math.max(15, roundUp(readingTime(documentWords(doc), level)));
}

/**
 * Estimated seconds of a page from its items. A skim document counts its stored `skimSeconds`; the exam
 * document its reading time at the skim speed; an open document nothing (the questions include reading it).
 */
export function readingPageEstimate(
  items: ReadingItem[],
  documents: Map<string, ReadingDocument>,
  level: Level,
  exam: boolean,
): number {
  const R = READING_PAGE_RULES;
  let seconds = 0;
  for (const it of items) {
    switch (it.type) {
      case 'reading_flashcards':
        seconds += it.keywordIds.length * R.keywordCardS;
        break;
      case 'reading_keyword_matching':
        seconds += it.keywordIds.length * R.keywordPairS;
        break;
      case 'reading_document': {
        const doc = documents.get(it.documentId);
        if (it.view === 'skim') seconds += it.skimSeconds ?? 0;
        else if (it.view === 'exam' && doc)
          seconds += Math.round(readingTime(documentWords(doc), level));
        break;
      }
      case 'reading_skim_choice':
        seconds += R.skimQuestionS;
        break;
      case 'reading_choice':
      case 'reading_true_false':
        seconds += exam ? R.examQuestionS : R.detailQuestionS;
        break;
      case 'reading_order':
        seconds += it.pieces.length * R.orderPieceS;
        break;
    }
  }
  return seconds;
}

/** Lesson minutes: the sum of the page estimates, rounded to whole minutes, at least 1. */
export const readingMinutes = (pageEstimatesS: number[]) =>
  Math.max(1, Math.round(pageEstimatesS.reduce((n, s) => n + s, 0) / 60));

/** Countdown of the exam page: 1.5 times its estimate, rounded up to 5 s (D18 exception). */
export const readingTimeLimit = (estimateS: number) =>
  roundUp(estimateS * READING_PAGE_RULES.timeLimitFactor);
