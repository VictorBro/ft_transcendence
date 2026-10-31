import { describe, expect, it } from 'vitest';

import {
  AnswerSchema,
  AttemptReadSchema,
  ItemViewSchema,
  PageResultSchema,
  PageViewSchema,
  SubmitPageSchema,
  UnitFeedbackSchema,
  UnitViewSchema,
} from './view';

const REF = 'AbCdEfGhIjKl-_09';
const OTHER = 'ZyXwVuTsRqPo0123';
const ID = '6f1c2b8e-3d4a-4e5f-9a6b-7c8d9e0f1a2b';
const text = { en: 'e', fr: 'f', de: 'd' };

describe('the view schemas', () => {
  it('take a ref of exactly 16 base64url characters', () => {
    const choice = {
      ref: REF,
      kind: 'choice',
      prompt: {},
      options: [{ ref: OTHER, text: 'un', lang: 'learning' }],
    };
    expect(UnitViewSchema.parse(choice)).toEqual(choice);
    expect(UnitViewSchema.safeParse({ ...choice, ref: 'gap-livre' }).success).toBe(false);
    expect(UnitViewSchema.safeParse({ ...choice, ref: `${REF}=` }).success).toBe(false);
  });

  it('reject any key they do not list: a key that slips in fails', () => {
    const unit = { ref: REF, kind: 'text', prompt: { native: 'a book' }, article: 'indefinite' };
    expect(UnitViewSchema.safeParse(unit).success).toBe(true);
    expect(UnitViewSchema.safeParse({ ...unit, accepted: { answers: ['un livre'] } }).success).toBe(
      false,
    );
    expect(
      UnitViewSchema.safeParse({ ...unit, prompt: { native: 'a book', answer: 'x' } }).success,
    ).toBe(false);
    const options = [{ ref: OTHER, text: 'un', lang: 'learning', correct: true }];
    expect(
      UnitViewSchema.safeParse({ ref: REF, kind: 'choice', prompt: {}, options }).success,
    ).toBe(false);
    const gap = { type: 'grammar_gap_typing', hint: null, units: [unit] };
    expect(ItemViewSchema.safeParse(gap).success).toBe(true);
    expect(ItemViewSchema.safeParse({ ...gap, itemId: 'gap-livre' }).success).toBe(false);
    expect(ItemViewSchema.safeParse({ ...gap, answerExplanation: text }).success).toBe(false);
    // A presentation item is whole, but still strict.
    const document = {
      type: 'reading_document',
      view: 'open',
      skimSeconds: null,
      document: { title: null, meta: [], paragraphs: ['Salut'], highlights: [] },
    };
    expect(ItemViewSchema.safeParse(document).success).toBe(true);
    expect(
      ItemViewSchema.safeParse({ ...document, document: { ...document.document, genre: 'email' } })
        .success,
    ).toBe(false);
  });

  it('describe a page with no key, and its feedback with the keys', () => {
    const page = { index: 3, role: 'practice', scored: true, instructions: text, items: [] };
    expect(PageViewSchema.parse(page)).toEqual(page);
    const feedback = {
      ref: REF,
      outcome: 'orthography_only',
      points: 0.5,
      scored: true,
      answer: 'un café',
      explanation: text,
      marks: [{ text: 'cafe', wrong: true }],
    };
    expect(UnitFeedbackSchema.parse(feedback)).toEqual(feedback);
    expect(UnitFeedbackSchema.safeParse({ ...feedback, points: 0.25 }).success).toBe(false);
    const attempt = {
      attemptId: ID,
      current: page,
      remainingMs: null,
      practice: { earned: 1.5, possible: 30 },
      results: null,
    };
    expect(PageResultSchema.parse({ feedback: [feedback], attempt }).attempt).toEqual(attempt);
    expect(AttemptReadSchema.safeParse({ outline: {}, attempt }).success).toBe(false);
  });

  it('take the four answer shapes and nothing else', () => {
    for (const answer of [
      { text: 'des ciseaux', gender: 'masculine' },
      { option: REF },
      { tokens: [REF, OTHER] },
      { token: REF, text: 'suis' },
    ])
      expect(AnswerSchema.parse(answer)).toEqual(answer);
    expect(AnswerSchema.safeParse({ option: 'masculine' }).success).toBe(false);
    expect(AnswerSchema.safeParse({ text: 'x', points: 1 }).success).toBe(false);
    expect(SubmitPageSchema.parse({ attemptId: ID, answers: {} })).toEqual({
      attemptId: ID,
      answers: {},
    });
    expect(SubmitPageSchema.safeParse({ attemptId: 'a1', answers: {} }).success).toBe(false);
    expect(
      SubmitPageSchema.safeParse({ attemptId: ID, answers: { 'gap-livre': { text: 'x' } } })
        .success,
    ).toBe(false);
  });
});
