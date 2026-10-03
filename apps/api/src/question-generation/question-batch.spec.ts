import { type GeneratedItem, LEVELS, type QuestionCategory } from '@ft/shared';
import { describe, expect, it } from 'vitest';

import { type Cell, freshItems, toRows } from './question-batch';

const item = (question: string, readText?: string): GeneratedItem => ({
  topic: 'verb_usage',
  question,
  options: ['gave', 'took', 'put', 'got'],
  answer: 'gave',
  ...(readText && { readText }),
});

/**
 * The table in docs/ITEM_BANK.md section 3, A1 to C2, reading at the top of each
 * range. Written out rather than read from the doc: the image CI tests in ships
 * no docs. Change both together.
 */
const DOCUMENTED_LIMITS: Record<QuestionCategory, number[]> = {
  vocabulary: [30, 45, 45, 45, 60, 60],
  grammar: [30, 45, 60, 60, 75, 90],
  reading: [75, 105, 90, 120, 165, 180],
};

describe('freshItems', () => {
  it('drops a question the cell already has, whatever its case or spacing', () => {
    const batch = [item('  He ___ up   smoking.'), item('She ___ a shower.')];

    expect(freshItems(batch, [{ question: 'he ___ UP smoking. ', readText: null }])).toEqual([
      batch[1],
    ]);
  });

  it('keeps a question that differs only by a space, as "in to" and "into" do', () => {
    const batch = [item('He walked ___ into the room.')];

    expect(
      freshItems(batch, [{ question: 'He walked ___ in to the room.', readText: null }]),
    ).toEqual(batch);
  });

  it('keeps the first of two questions that repeat within the batch, in order', () => {
    const batch = [item('A ___.'), item('B ___.'), item('a  ___.'), item('C ___.')];

    expect(freshItems(batch, [])).toEqual([batch[0], batch[1], batch[3]]);
  });

  it('tells reading questions apart by their passage too', () => {
    const stored = [{ question: 'What is the main idea?', readText: 'Tom has a red bike.' }];
    const batch = [
      item('What is the main idea?', 'TOM has a red   bike.'),
      item('What is the main idea?', 'Anna is hungry.'),
    ];

    expect(freshItems(batch, stored)).toEqual([batch[1]]);
  });
});

describe('toRows', () => {
  it('files each item in the cell, unreviewed, with the time limit of the cell', () => {
    const cell: Cell = { lang: 'fr', level: 'B1', category: 'vocabulary' };
    const asked = item('Il a ___ de fumer.');

    expect(toRows(cell, [asked])).toEqual([{ ...asked, ...cell, sourceId: null, timeLimitS: 45 }]);
  });

  it('keeps the passage of a reading item', () => {
    const cell: Cell = { lang: 'en', level: 'A2', category: 'reading' };

    expect(toRows(cell, [item('Where is Tom?', 'Tom is at home.')])[0].readText).toBe(
      'Tom is at home.',
    );
  });

  it.each(Object.entries(DOCUMENTED_LIMITS))(
    'gives %s the limits of docs/ITEM_BANK.md, reading at the top of each range',
    (category, documented) => {
      const limits = LEVELS.map(
        (level) =>
          toRows({ lang: 'de', level, category: category as QuestionCategory }, [
            item('Er ___.'),
          ])[0].timeLimitS,
      );

      expect(limits).toEqual(documented);
    },
  );
});
