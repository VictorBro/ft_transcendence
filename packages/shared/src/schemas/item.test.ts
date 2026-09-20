import { describe, expect, it } from 'vitest';

import {
  CATEGORY_ID_SEGMENT,
  ItemFileSchema,
  ItemSchema,
  itemFileName,
  OPTIONS_PER_ITEM,
  QUESTION_CATEGORIES,
  type Item,
} from './item';

/**
 * The contract itself. The authored files are checked separately, by
 * apps/api/src/items/item-files.spec.ts, which needs Node to read them.
 */

const item: Item = {
  sourceId: 'en-gram-0001',
  level: 'A1',
  topic: 'verbs_morphology',
  question: 'My sister ___ a doctor.',
  options: ['is', 'am', 'are', 'be'],
  answer: 'is',
  timeLimitS: 30,
};

const file = { lang: 'en', category: 'grammar', items: [item] } as const;

describe('ItemSchema', () => {
  /**
   * A0 says a learner knows nothing yet, so there is nothing below A1 to ask.
   * Without this, an item authored at A0 would sit in a pool no exam draws from.
   */
  it('rejects a question authored at A0', () => {
    expect(ItemSchema.safeParse({ ...item, level: 'A0' }).success).toBe(false);
  });

  it('accepts a well-formed item', () => {
    expect(ItemSchema.safeParse(item).success).toBe(true);
  });

  // Stored as text rather than an index, so options can be shuffled when
  // served. That only works if the text is actually one of them.
  it('rejects an answer that is not one of the options', () => {
    expect(ItemSchema.safeParse({ ...item, answer: 'was' }).success).toBe(false);
  });

  it('rejects duplicated options', () => {
    expect(ItemSchema.safeParse({ ...item, options: ['is', 'is', 'are', 'be'] }).success).toBe(
      false,
    );
  });

  it(`requires exactly ${OPTIONS_PER_ITEM} options`, () => {
    expect(ItemSchema.safeParse({ ...item, options: ['is', 'am', 'are'] }).success).toBe(false);
  });

  it('rejects a sourceId that is not <lang>-<gram|voca|read>-<4 digits>', () => {
    for (const sourceId of ['en-gram-1', 'gram-0001', 'en-xxxx-0001', 'EN-GRAM-0001']) {
      expect(ItemSchema.safeParse({ ...item, sourceId }).success, sourceId).toBe(false);
    }
  });

  it('rejects an unknown level or topic', () => {
    expect(ItemSchema.safeParse({ ...item, level: 'B3' }).success).toBe(false);
    expect(ItemSchema.safeParse({ ...item, topic: 'made_up' }).success).toBe(false);
  });

  // The countdown the exam runs on. A missing or zero limit would either throw
  // at insert or expire the question the moment it is served.
  it('requires a positive whole timeLimitS', () => {
    const { timeLimitS: _dropped, ...withoutLimit } = item;
    expect(ItemSchema.safeParse(withoutLimit).success, 'missing').toBe(false);

    for (const timeLimitS of [0, -30, 30.5]) {
      expect(ItemSchema.safeParse({ ...item, timeLimitS }).success, `${timeLimitS}`).toBe(false);
    }
  });

  // Strict, so a field somebody invented is a failure rather than silent data
  // the seed script will drop.
  it('rejects an unknown field', () => {
    expect(ItemSchema.safeParse({ ...item, difficulty: 7 }).success).toBe(false);
  });
});

describe('ItemFileSchema', () => {
  it('accepts a well-formed file', () => {
    expect(ItemFileSchema.safeParse(file).success).toBe(true);
  });

  it('rejects two items sharing a sourceId', () => {
    const clash = { ...file, items: [item, { ...item, question: 'Different.' }] };
    expect(ItemFileSchema.safeParse(clash).success).toBe(false);
  });

  it('requires readText on reading questions and forbids it elsewhere', () => {
    const reading: Item = { ...item, sourceId: 'en-read-0001' };

    expect(
      ItemFileSchema.safeParse({ lang: 'en', category: 'reading', items: [reading] }).success,
      'reading without readText',
    ).toBe(false);

    expect(
      ItemFileSchema.safeParse({
        ...file,
        items: [{ ...item, readText: 'Not needed here.' }],
      }).success,
      'grammar with readText',
    ).toBe(false);

    expect(
      ItemFileSchema.safeParse({
        lang: 'en',
        category: 'reading',
        items: [{ ...reading, readText: 'A short text.' }],
      }).success,
      'reading with readText',
    ).toBe(true);
  });

  it("rejects a sourceId that disagrees with the file's own language or category", () => {
    expect(
      ItemFileSchema.safeParse({ ...file, items: [{ ...item, sourceId: 'de-gram-0001' }] }).success,
      'wrong language',
    ).toBe(false);
    expect(
      ItemFileSchema.safeParse({ lang: 'en', category: 'vocabulary', items: [item] }).success,
      'wrong category',
    ).toBe(false);
  });

  it('rejects an empty file', () => {
    expect(ItemFileSchema.safeParse({ ...file, items: [] }).success).toBe(false);
  });
});

describe('naming helpers', () => {
  it('builds the file name the seed script globs', () => {
    expect(itemFileName('de', 'vocabulary')).toBe('de-vocabulary.json');
  });

  it('gives every category a sourceId segment', () => {
    for (const category of QUESTION_CATEGORIES) {
      expect(CATEGORY_ID_SEGMENT[category], category).toMatch(/^[a-z]{4}$/);
    }
  });
});
