import { describe, expect, it } from 'vitest';
import type { PlacementQuestion, PlacementResult } from '@ft/shared';

import { isPlacementResult, PlacementStateSchema } from './placement-schema';

/** A grammar question carries no readText: the schema's refine rejects one. */
const question: PlacementQuestion = {
  lang: 'fr',
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
  lang: 'fr',
  targetLevel: 'B2',
  applied: true,
  report: [
    {
      questionId: '11111111-1111-4111-8111-111111111111',
      level: 'B1',
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

  // Unknown keys are stripped, not refused, so a field the schema lost would
  // vanish here and the debrief would render without it.
  it('keeps the passage and the level of a reading entry in the result', () => {
    const reading: PlacementResult = {
      ...result,
      report: [
        {
          questionId: '22222222-2222-4222-8222-222222222222',
          level: 'A2',
          question: 'Comment Marie va-t-elle au travail ?',
          readText: 'Tous les matins, Marie prend le train de huit heures pour aller au travail.',
          options: ['En train', 'En bus', 'À pied', 'En voiture'],
          chosen: 'En train',
          correct: 'En train',
          wasCorrect: true,
        },
      ],
    };

    expect(PlacementStateSchema.parse(reading)).toEqual(reading);
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
