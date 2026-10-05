// Pure functions used by QuestionStockService: no database, no LLM, no Nest.
// They take data and return data, so they are easy to test (see question-batch.spec.ts).

import type { GeneratedItem, Language, Level, QuestionCategory } from '@ft/shared';

import type { Prisma } from '../generated/prisma/client';

/**
 * The slice of the bank a placement probe draws from, and the unit it is restocked by.
 * One cell = one language + one level + one category, for example fr / B1 / grammar.
 * The field names match the QuestionBank columns, so a Cell can be used directly
 * as a Prisma filter ("where: cell").
 */
export type Cell = { lang: Language; level: Level; category: QuestionCategory };

// What we read back from the database to spot duplicates: only the two fields we compare.
// readText is "string | null" because the database stores a missing passage as null.
type Stored = { question: string; readText: string | null };

/**
 * Seconds on the clock for a generated question, by category and level.
 * Record<A, B> is an object with every key of A, each holding a B. Here it is nested:
 * for each category, for each level, a number. TypeScript checks that no category
 * and no level is forgotten.
 * The numbers are docs/ITEM_BANK.md's table, reading at the top of each range:
 * a generated passage may be long. The model never chooses the time limit.
 */
const TIME_LIMIT_S: Record<QuestionCategory, Record<Level, number>> = {
  vocabulary: { A1: 30, A2: 45, B1: 45, B2: 45, C1: 60, C2: 60 },
  grammar: { A1: 30, A2: 45, B1: 60, B2: 60, C1: 75, C2: 90 },
  reading: { A1: 75, A2: 105, B1: 90, B2: 120, C1: 165, C2: 180 },
};

// Makes two texts comparable: no spaces at the ends, lower case, and every run of
// spaces or line breaks (\s+) turned into one space.
// So "Je  mange ___ ." and "je mange ___ ." count as the same question.
const normalise = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * The text that identifies a question, to find duplicates: passage + question, normalised.
 * The passage counts: "What is the main idea?" can rightly come back on every text.
 * It accepts a generated item or a stored row ("GeneratedItem | Stored"): both have
 * question and readText. "readText ?? ''" uses an empty passage when there is none
 * (undefined for a generated item, null for a stored row).
 */
const itemKey = ({ question, readText }: GeneratedItem | Stored) =>
  [readText ?? '', question].map(normalise).join('\n');

/**
 * The items that are neither in the cell already nor repeated earlier in the batch.
 * "seen" starts with the keys of every stored question. Then for each new item:
 * key already seen -> drop it; otherwise keep it and remember its key, so a second
 * copy later in the same batch is dropped too.
 * A Set is a list without duplicates, with a fast "has".
 * "readonly" on the arrays means this function promises not to change them.
 */
export function freshItems(items: readonly GeneratedItem[], stored: readonly Stored[]) {
  const seen = new Set(stored.map(itemKey));
  return items.filter((item) => {
    const key = itemKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Turns generated items into rows ready for prisma.questionBank.createMany.
 * Each row is: the item's fields (topic, question, options, answer, readText)
 * + the cell (lang, level, category) + sourceId null + the time limit.
 * - "...item" and "...cell" copy all their fields into the new object (spread).
 * - sourceId null marks a generated row: nobody reviewed it. Written questions
 *   have a sourceId like "fr-gram-0001".
 * - The level comes from the cell, never from the model, so a question can not be
 *   filed at the wrong level.
 * Prisma.QuestionBankCreateManyInput is the row type Prisma generated from schema.prisma.
 */
export function toRows(
  cell: Cell,
  items: readonly GeneratedItem[],
): Prisma.QuestionBankCreateManyInput[] {
  const timeLimitS = TIME_LIMIT_S[cell.category][cell.level];
  return items.map((item) => ({ ...item, ...cell, sourceId: null, timeLimitS }));
}
