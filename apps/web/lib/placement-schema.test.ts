import { describe, expect, it } from 'vitest';
import type { PlacementQuestion, PlacementResult } from '@ft/shared';

import { isPlacementResult, PlacementStateSchema } from './placement-schema';

/** A grammar question carries no readText: the schema's refine rejects one. */
const question: PlacementQuestion = {
  questionId: '11111111-1111-4111-8111-111111111111',
  category: 'grammar',
  level: 'B1',
  question: 'Hier, je ___ au cinéma.',
  options: ['vais', 'suis allé', 'irai', 'allais'],
  timeLimitS: 30,
  remainingS: 25,
  progress: { answered: 2, maxQuestionsRemaining: 4 },
};

const result: PlacementResult = {
  targetLevel: 'B2',
  report: [
    {
      questionId: '11111111-1111-4111-8111-111111111111',
      question: 'Hier, je ___ au cinéma.',
      options: ['vais', 'suis allé', 'irai', 'allais'],
      chosen: 'vais',
      correct: 'suis allé',
      wasCorrect: false,
    },
  ],
};

describe('PlacementStateSchema', () => {
  // The same endpoint answers with either shape: a run that has ended returns
  // its verdict, not a question.
  it.each([
    ['the question in progress', question],
    ['the result once the exam has ended', result],
  ])('accepts %s', (_, payload) => {
    expect(PlacementStateSchema.parse(payload)).toEqual(payload);
  });

  // A 200 carrying neither shape says nothing about the run, and parsing it as
  // a question would crash the render instead.
  it.each([
    ['a payload matching neither shape', { not: 'a placement payload' }],
    ['a question that leaked its answer', { ...question, answer: 'suis allé' }],
  ])('rejects %s', (_, payload) => {
    expect(PlacementStateSchema.safeParse(payload).success).toBe(false);
  });
});

describe('isPlacementResult', () => {
  it('tells a result from a question', () => {
    expect(isPlacementResult(result)).toBe(true);
    expect(isPlacementResult(question)).toBe(false);
  });
});
