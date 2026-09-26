import { describe, expect, it } from 'vitest';

import { ExamSessionSchema } from './placement.schema';

describe('ExamSessionSchema', () => {
  it('validates a valid exam session', () => {
    const session = {
      evalId: 'd7c1e4a2-5d38-4f6b-9a02-1e7c8d3f5b64',
      lang: 'en',
      lo: 0,
      hi: 5,
      level: 2,
      mistakesPerLevel: 1,
      askedPerCategory: { grammar: 1, vocabulary: 1, reading: 0 },
      totalAnswered: 2,
      answers: [],
      ended: false,
      currentQuestionId: 'b7c1e4a2-5d38-4f6b-9a02-1e7c8d3f5b64',
      servedAt: '2026-09-18T17:51:11.000Z',
    };
    expect(ExamSessionSchema.parse(session)).toEqual(session);
  });

  it('allows currentQuestionId to be null', () => {
    const session = {
      evalId: 'd7c1e4a2-5d38-4f6b-9a02-1e7c8d3f5b64',
      lang: 'fr',
      lo: 0,
      hi: 3,
      level: 1,
      mistakesPerLevel: 0,
      askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
      totalAnswered: 0,
      answers: [],
      ended: false,
      currentQuestionId: null,
      servedAt: '2026-09-18T17:51:11.000Z',
    };
    expect(ExamSessionSchema.parse(session).currentQuestionId).toBeNull();
  });

  it('rejects mistakesPerLevel exceeding 2 or below 0', () => {
    const base = {
      evalId: 'd7c1e4a2-5d38-4f6b-9a02-1e7c8d3f5b64',
      lang: 'en',
      lo: 0,
      hi: 5,
      level: 2,
      mistakesPerLevel: 3,
      askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
      totalAnswered: 0,
      answers: [],
      ended: false,
      currentQuestionId: null,
      servedAt: '2026-09-18T17:51:11.000Z',
    };
    expect(ExamSessionSchema.safeParse(base).success).toBe(false);
    expect(ExamSessionSchema.safeParse({ ...base, mistakesPerLevel: -1 }).success).toBe(false);
  });

  it('rejects an invalid evaluation ID', () => {
    expect(
      ExamSessionSchema.safeParse({
        evalId: 'not-a-uuid',
        lang: 'en',
        lo: 0,
        hi: 5,
        level: 2,
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 0,
        answers: [],
        ended: false,
        currentQuestionId: null,
        servedAt: '2026-09-18T17:51:11.000Z',
      }).success,
    ).toBe(false);
  });
});
