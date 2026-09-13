import { describe, expect, it } from 'vitest';

import {
  ItemFileSchema,
  ItemSchema,
  itemFileName,
  OPTIONS_PER_ITEM,
  SKILL_ID_SEGMENT,
  SKILLS,
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

  it('rejects an id that is not <lang>-<skill>-<4 digits>', () => {
    for (const sourceId of ['en-gram-1', 'gram-0001', 'en-xxxx-0001', 'EN-GRAM-0001']) {
      expect(ItemSchema.safeParse({ ...item, sourceId }).success, sourceId).toBe(false);
    }
  });

  it('rejects an unknown cefr level or topic', () => {
    expect(ItemSchema.safeParse({ ...item, level: 'B3' }).success).toBe(false);
    expect(ItemSchema.safeParse({ ...item, topic: 'made_up' }).success).toBe(false);
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

  it('rejects two items sharing an id', () => {
    const clash = { ...file, items: [item, { ...item, question: 'Different.' }] };
    expect(ItemFileSchema.safeParse(clash).success).toBe(false);
  });

  it('requires a passage on reading items and forbids it elsewhere', () => {
    const reading: Item = { ...item, sourceId: 'en-read-0001' };

    expect(
      ItemFileSchema.safeParse({ lang: 'en', category: 'reading', items: [reading] }).success,
      'reading without a passage',
    ).toBe(false);

    expect(
      ItemFileSchema.safeParse({
        ...file,
        items: [{ ...item, readText: 'Not needed here.' }],
      }).success,
      'grammar with a passage',
    ).toBe(false);

    expect(
      ItemFileSchema.safeParse({
        lang: 'en',
        category: 'reading',
        items: [{ ...reading, readText: 'A short text.' }],
      }).success,
      'reading with a passage',
    ).toBe(true);
  });

  it("rejects an id that disagrees with the file's own language or skill", () => {
    expect(
      ItemFileSchema.safeParse({ ...file, items: [{ ...item, sourceId: 'de-gram-0001' }] }).success,
      'wrong language',
    ).toBe(false);
    expect(
      ItemFileSchema.safeParse({ lang: 'en', category: 'vocabulary', items: [item] }).success,
      'wrong skill',
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

  it('gives every skill an id segment', () => {
    for (const skill of SKILLS) {
      expect(SKILL_ID_SEGMENT[skill], skill).toMatch(/^[a-z]{4}$/);
    }
  });
});
