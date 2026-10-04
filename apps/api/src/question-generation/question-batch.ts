import type { GeneratedItem, Language, Level, QuestionCategory } from '@ft/shared';

import type { Prisma } from '../generated/prisma/client';

/** The slice of the bank a placement probe draws from, and the unit it is restocked by. */
export type Cell = { lang: Language; level: Level; category: QuestionCategory };

type Stored = { question: string; readText: string | null };

// docs/ITEM_BANK.md's table, reading at the top of each range: a generated passage may be long.
const TIME_LIMIT_S: Record<QuestionCategory, Record<Level, number>> = {
  vocabulary: { A1: 30, A2: 45, B1: 45, B2: 45, C1: 60, C2: 60 },
  grammar: { A1: 30, A2: 45, B1: 60, B2: 60, C1: 75, C2: 90 },
  reading: { A1: 75, A2: 105, B1: 90, B2: 120, C1: 165, C2: 180 },
};

const normalise = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');

// The passage counts: "What is the main idea?" can rightly come back on every text.
const itemKey = ({ question, readText }: GeneratedItem | Stored) =>
  [readText ?? '', question].map(normalise).join('\n');

/** The items that are neither in the cell already nor repeated earlier in the batch. */
export function freshItems(items: readonly GeneratedItem[], stored: readonly Stored[]) {
  const seen = new Set(stored.map(itemKey));
  return items.filter((item) => {
    const key = itemKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function toRows(
  cell: Cell,
  items: readonly GeneratedItem[],
): Prisma.QuestionBankCreateManyInput[] {
  const timeLimitS = TIME_LIMIT_S[cell.category][cell.level];
  return items.map((item) => ({ ...item, ...cell, sourceId: null, timeLimitS }));
}
