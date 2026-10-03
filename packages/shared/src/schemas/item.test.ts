import { describe, expect, it } from 'vitest';

import {
  CATEGORY_ID_SEGMENT,
  generatedBatchSchema,
  ItemFileSchema,
  ItemSchema,
  itemFileName,
  OPTIONS_PER_ITEM,
  QUESTION_CATEGORIES,
  READING_BATCH_SIZE,
  READING_TOPIC,
  TOPICS,
  VOCABULARY_BATCH_SIZE,
  VOCABULARY_TOPICS,
  type Item,
  type QuestionCategory,
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

describe('generatedBatchSchema', () => {
  // What the LLM sends back: no sourceId, level or time limit, the cell sets those.
  const asked = {
    question: 'My sister ___ a doctor.',
    options: ['is', 'am', 'are', 'be'],
    answer: 'is',
  };
  const batches: Record<QuestionCategory, object[]> = {
    grammar: TOPICS.map((topic) => ({ ...asked, topic })),
    vocabulary: Array.from({ length: VOCABULARY_BATCH_SIZE }, (_, n) => ({
      ...asked,
      topic: VOCABULARY_TOPICS[n % VOCABULARY_TOPICS.length],
    })),
    reading: Array.from({ length: READING_BATCH_SIZE }, (_, n) => ({
      ...asked,
      topic: READING_TOPIC,
      readText: `A short text, number ${n}.`,
    })),
  };
  const parse = (category: QuestionCategory, items: object[]) =>
    generatedBatchSchema(category).safeParse({ items });
  const withFirst = (category: QuestionCategory, patch: object) =>
    batches[category].map((i, n) => (n === 0 ? { ...i, ...patch } : i));
  // What the retry log shows when a reply is turned down.
  const issues = (category: QuestionCategory, items: object[]) =>
    parse(category, items).error?.issues.map(({ path, message }) => ({ path, message }));

  it.each(QUESTION_CATEGORIES)('accepts a well-formed %s batch', (category) => {
    expect(parse(category, batches[category]).success).toBe(true);
  });

  it.each(QUESTION_CATEGORIES)(
    'rejects a %s batch one question short or one too many',
    (category) => {
      const items = batches[category];
      const codes = (sized: object[]) => parse(category, sized).error?.issues.map((i) => i.code);

      expect(codes(items.slice(1))).toContain('too_small');
      expect(codes([...items, items[0]])).toContain('too_big');
    },
  );

  // One stray key used to throw away the whole batch.
  it.each(QUESTION_CATEGORIES)('drops the keys the server sets from a %s question', (category) => {
    const items = withFirst(category, { level: 'C2', timeLimitS: 5, sourceId: 'en-gram-0001' });

    expect(parse(category, items).data?.items[0]).toEqual(batches[category][0]);
  });

  it.each(QUESTION_CATEGORIES)(
    'rejects a %s question whose answer is not an option, or with repeated options',
    (category) => {
      expect(issues(category, withFirst(category, { answer: 'was' }))).toEqual([
        { path: ['items', 0, 'answer'], message: 'answer must appear verbatim in options' },
      ]);
      expect(issues(category, withFirst(category, { options: ['is', 'is', 'are', 'be'] }))).toEqual(
        [{ path: ['items', 0, 'options'], message: 'options must all be different' }],
      );
    },
  );

  it.each(QUESTION_CATEGORIES)('rejects an empty question or option in a %s batch', (category) => {
    expect(parse(category, withFirst(category, { question: '' })).success).toBe(false);
    expect(parse(category, withFirst(category, { options: ['is', '', 'are', 'be'] })).success).toBe(
      false,
    );
  });

  // French "à", English "a".
  it.each(QUESTION_CATEGORIES)('takes a one-letter option in a %s batch', (category) => {
    const items = withFirst(category, { options: ['a', 'an', 'the', 'one'], answer: 'a' });

    expect(parse(category, items).success).toBe(true);
  });

  it.each(['grammar', 'vocabulary'] as const)('drops a readText from a %s question', (category) => {
    expect(
      parse(category, withFirst(category, { readText: 'Not needed.' })).data?.items[0],
    ).toEqual(batches[category][0]);
  });

  it('rejects a grammar batch that repeats a topic', () => {
    expect(issues('grammar', withFirst('grammar', { topic: TOPICS[1] }))).toEqual([
      { path: ['items'], message: 'expected exactly one question per topic' },
    ]);
  });

  it('rejects a grammar question on a topic outside TOPICS', () => {
    expect(
      parse('grammar', withFirst('grammar', { topic: 'made_up' })).error?.issues,
    ).toContainEqual(
      expect.objectContaining({ code: 'invalid_value', path: ['items', 0, 'topic'] }),
    );
  });

  it('lets vocabulary repeat a topic, but only one of VOCABULARY_TOPICS', () => {
    const allVerbs = batches.vocabulary.map((i) => ({ ...i, topic: 'verb_usage' }));

    expect(parse('vocabulary', allVerbs).success).toBe(true);
    expect(parse('vocabulary', withFirst('vocabulary', { topic: 'pronouns' })).success).toBe(false);
  });

  it('rejects a reading question without a readText, or on another topic', () => {
    expect(parse('reading', withFirst('reading', { readText: undefined })).success).toBe(false);
    expect(parse('reading', withFirst('reading', { readText: '' })).success).toBe(false);
    expect(parse('reading', withFirst('reading', { topic: TOPICS[0] })).success).toBe(false);
  });

  it('rejects a reading batch that reuses a passage', () => {
    const reused = withFirst('reading', { readText: 'A short text, number 1.' });

    expect(issues('reading', reused)).toEqual([
      { path: ['items'], message: 'reading questions need distinct readText passages' },
    ]);
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
