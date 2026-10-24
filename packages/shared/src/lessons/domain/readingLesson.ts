import type { Level } from '../../schemas/item';
import type { ReadingDocument, ReadingItem } from '../schemas/reading';

/**
 * The word counts and duration calculations of a reading lesson.
 *
 * Each page of a reading lesson states its estimatedDurationS; the skim
 * page also states how long the document stays visible (skimSeconds),
 * and the exam page its countdown (timeLimitS). Nobody picks these
 * numbers: they follow the rules below. The validator
 * (../validation/reading.ts) recomputes them and compares; the authoring
 * kit (#83) will compute them here when it writes a lesson.
 *
 * It also counts the words of a document (READING_WORDS sets how many a
 * document must have per level) and finds the key words in the text, to
 * check that each highlight is really there.
 */

/** The fixed durations, in seconds, per card, pair, question or piece. */
export const READING_PAGE_RULES = {
  keywordCardS: 10,
  keywordPairS: 10,
  /** The skim question, answered once the document is hidden. */
  skimQuestionS: 20,
  detailQuestionS: 30,
  orderPieceS: 15,
  examQuestionS: 20,
  /** The exam's countdown is 1.5 × the page's duration… */
  timeLimitFactor: 1.5,
  /** …rounded up to a multiple of 5 s, like the skim time (32 s → 35 s). */
  roundS: 5,
} as const;

/**
 * How fast a learner skims, in words per minute, per level: an A1
 * learner reads 75 words in a minute, a C2 learner 170.
 */
export const READING_SKIM_WPM: Record<Level, number> = {
  A1: 75,
  A2: 90,
  B1: 110,
  B2: 130,
  C1: 150,
  C2: 170,
};

/** Rounds up to the next multiple of 5 s: 31 → 35, 35 → 35. */
const roundUp = (seconds: number) =>
  Math.ceil(seconds / READING_PAGE_RULES.roundS) * READING_PAGE_RULES.roundS;

/**
 * The number of words in a text: the pieces between spaces that hold at
 * least one letter or digit. "l'heure" is one word, "18h30" is one, "€"
 * and "-" are none. (\p{L} is any letter, accents included, \p{N} any
 * digit; the `u` flag turns these on.)
 */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

/** A letter or a digit: what a word is made of. */
const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * Where the key words appear in a paragraph, from left to right, as
 * whole words only: "Entrée" is not found inside "Entrées". When two key
 * words overlap, the one that starts first is kept; at the same start,
 * the longer one. `at` is the position of the first character.
 *
 *   highlightRanges("Entrée libre. Entrées : 5 €", ["Entrée"])
 *     → [{ at: 0, word: "Entrée" }]    (not the one inside "Entrées")
 *
 * The validator uses it to check that each highlight of the main
 * document is really in its text.
 */
export function highlightRanges(text: string, words: string[]): { at: number; word: string }[] {
  // Every place each word appears, if the characters around it are not letters or digits.
  const found: { at: number; word: string }[] = [];
  for (const word of words) {
    for (let at = text.indexOf(word); at >= 0 && word; at = text.indexOf(word, at + 1)) {
      if (!WORD_CHAR.test(text[at - 1] ?? '') && !WORD_CHAR.test(text[at + word.length] ?? ''))
        found.push({ at, word });
    }
  }
  // Left to right, the longer first at one position; then skip any that overlaps the previous one kept.
  found.sort((a, b) => a.at - b.at || b.word.length - a.word.length);
  const ranges: typeof found = [];
  for (const range of found) {
    const last = ranges.at(-1);
    if (!last || range.at >= last.at + last.word.length) ranges.push(range);
  }
  return ranges;
}

/**
 * The number of words of everything a document shows: its title, its
 * small lines (meta) and its paragraphs. The validator compares it with
 * READING_WORDS for the lesson's level.
 */
export function documentWords(doc: Pick<ReadingDocument, 'title' | 'meta' | 'paragraphs'>): number {
  return [doc.title, ...doc.meta, ...doc.paragraphs].reduce(
    (n, text) => n + (text ? countWords(text) : 0),
    0,
  );
}

/** The seconds needed to read `words` words at the level's speed, not rounded: 60 words at A1 = 48 s. */
const readingTime = (words: number, level: Level) => (words * 60) / READING_SKIM_WPM[level];

/**
 * How long the skim view shows the main document: its reading time,
 * rounded up to 5 s, at least 15 s (60 words at A1: 48 s → 50 s). No
 * validator calls it; the authoring kit (#83) will, to write
 * skimSeconds.
 */
export function readingSkimSeconds(
  doc: Pick<ReadingDocument, 'title' | 'meta' | 'paragraphs'>,
  level: Level,
): number {
  return Math.max(15, roundUp(readingTime(documentWords(doc), level)));
}

/**
 * The duration of a page, in seconds: the sum of its items' durations.
 * A document counts differently according to its view:
 * - skim: the skimSeconds written in the item;
 * - exam: the document's reading time at the level's speed;
 * - open: nothing, since the time of the questions includes reading.
 * `exam` is true for the exam page: its questions count examQuestionS
 * instead of detailQuestionS. `documents` holds the lesson's two
 * documents by id ("main", "exam").
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

/**
 * The length of a lesson in minutes: the pages' durations added up,
 * rounded to the nearest minute, at least 1. No validator calls it; the
 * authoring kit (#83) will, to write estimatedMinutes.
 */
export const readingMinutes = (pageEstimatesS: number[]) =>
  Math.max(1, Math.round(pageEstimatesS.reduce((n, s) => n + s, 0) / 60));

/**
 * The countdown of the exam page: 1.5 × its duration, rounded up to 5 s
 * (100 s → 150 s, 101 s → 155 s). Functions lessons round to the second
 * instead.
 */
export const readingTimeLimit = (estimateS: number) =>
  roundUp(estimateS * READING_PAGE_RULES.timeLimitFactor);
