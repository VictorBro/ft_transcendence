import { ConflictException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuestionCategory } from '@ft/shared';

import type { ExamSession } from './placement.schema';

import { examSession, questionRow } from '../../test/placement.fixtures';
import type { QuestionBank } from '../generated/prisma/client';
import type { LlmProvider } from '../llm/llm.provider';
import type { PrismaService } from '../prisma/prisma.service';
import { QuestionStockService } from '../question-generation/question-stock.service';
import {
  LIMIT_UNSEEN_QUESTIONS_TO_RETRIEVE,
  PlacementQuestionService,
} from './placement-question.service';

const row = questionRow();

/** `unseen` is what the bank still holds for this user, per category. */
function serviceWith(unseen: Partial<Record<QuestionCategory, QuestionBank[]>> = {}) {
  const prisma = {
    questionBank: {
      findMany: vi.fn(
        async ({ where }: { where: { category: QuestionCategory } }) =>
          unseen[where.category] ?? [],
      ),
    },
    userSeenQuestion: {
      findFirst: vi.fn(async (): Promise<{ questionBank: QuestionBank } | null> => null),
      upsert: vi.fn(),
    },
  };
  const stock = { restock: vi.fn() };
  return {
    prisma,
    stock,
    service: new PlacementQuestionService(
      prisma as unknown as PrismaService,
      stock as unknown as QuestionStockService,
    ),
  };
}

describe('PlacementQuestionService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('getNewQuestion', () => {
    it('draws an unseen row of the run language and level, from the categories still open', async () => {
      const reading = questionRow({ category: 'reading' });
      const { service, prisma } = serviceWith({ reading: [reading] });
      const session = examSession({ askedPerCategory: { grammar: 2, vocabulary: 2, reading: 0 } });

      await expect(service.getNewQuestion('u-1', session)).resolves.toEqual([
        { reading: 1 },
        reading,
      ]);
      expect(prisma.questionBank.findMany).toHaveBeenCalledExactlyOnceWith({
        where: {
          lang: 'de',
          level: 'B1',
          category: 'reading',
          userSeenQuestions: { none: { userId: 'u-1' } },
        },
        orderBy: { sourceId: { sort: 'asc', nulls: 'last' } },
        take: LIMIT_UNSEEN_QUESTIONS_TO_RETRIEVE,
      });
    });

    const grammar = [questionRow(), questionRow()];
    const vocabulary = [
      questionRow({ category: 'vocabulary' }),
      questionRow({ category: 'vocabulary' }),
    ];

    it.each([
      [0, grammar[0]],
      [0.99, vocabulary[1]],
    ])('picks the category, then the row, with Math.random (%s)', async (random, expected) => {
      const { service, prisma } = serviceWith({ grammar, vocabulary });
      vi.spyOn(Math, 'random').mockReturnValue(random);

      await expect(service.getNewQuestion('u-1', examSession())).resolves.toEqual([
        { grammar: 2, vocabulary: 2, reading: 0 },
        expected,
      ]);
      expect(prisma.userSeenQuestion.findFirst).not.toHaveBeenCalled();
    });

    // questionRow is generated, sourceId null, unless given the id of a row people wrote.
    const written = questionRow({ sourceId: 'de-gram-0001' });

    it.each([0, 0.99])(
      'serves a written row while one is unseen, even with generated rows unseen beside it (%s)',
      async (random) => {
        const { service } = serviceWith({ grammar: [grammar[0], written, grammar[1]] });
        vi.spyOn(Math, 'random').mockReturnValue(random);
        const session = examSession({
          askedPerCategory: { grammar: 0, vocabulary: 2, reading: 2 },
        });

        await expect(service.getNewQuestion('u-1', session)).resolves.toEqual([
          { grammar: 3 },
          written,
        ]);
      },
    );

    // Category first, as ever: a written row elsewhere does not pull the draw to its category.
    it('serves a generated row once its category has no unseen written row left', async () => {
      const { service } = serviceWith({
        grammar: [grammar[0]],
        vocabulary: [questionRow({ category: 'vocabulary', sourceId: 'de-voca-0001' })],
      });
      vi.spyOn(Math, 'random').mockReturnValue(0);

      await expect(service.getNewQuestion('u-1', examSession())).resolves.toEqual([
        { grammar: 1, vocabulary: 1, reading: 0 },
        grammar[0],
      ]);
    });

    // A cell full of generated rows is well stocked, whatever is left of the written ones.
    it('hands the stock every unseen row of a category, written and generated', async () => {
      const { service, stock } = serviceWith({ grammar: [written, ...grammar] });
      const session = examSession({ askedPerCategory: { grammar: 0, vocabulary: 2, reading: 2 } });

      await service.getNewQuestion('u-1', session);

      expect(stock.restock).toHaveBeenCalledExactlyOnceWith(
        { lang: 'de', level: 'B1', category: 'grammar' },
        3,
      );
    });

    it('once no open category has unseen rows, falls back to the one seen longest ago, outside this run', async () => {
      const { service, prisma } = serviceWith();
      prisma.userSeenQuestion.findFirst.mockResolvedValue({ questionBank: vocabulary[1] });
      const [answered, current] = [randomUUID(), randomUUID()];
      const session = examSession({
        askedPerCategory: { grammar: 2, vocabulary: 0, reading: 0 },
        answers: [{ questionId: answered, choice: 'ist' }],
        currentQuestionId: current,
      });

      await expect(service.getNewQuestion('u-1', session)).resolves.toEqual([
        { vocabulary: 0, reading: 0 },
        vocabulary[1],
      ]);
      expect(prisma.userSeenQuestion.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'u-1',
          questionId: { notIn: [answered, current] },
          questionBank: { lang: 'de', level: 'B1', category: { in: ['vocabulary', 'reading'] } },
        },
        orderBy: { updatedAt: 'asc' },
        include: { questionBank: true },
      });
    });

    it('hands the stock what each open category has left unseen, without waiting for it', async () => {
      const { service, stock } = serviceWith({ grammar });
      stock.restock.mockReturnValue(new Promise(() => {}));
      const session = examSession({ askedPerCategory: { grammar: 0, vocabulary: 2, reading: 0 } });

      await service.getNewQuestion('u-1', session);

      expect(stock.restock.mock.calls).toEqual([
        [{ lang: 'de', level: 'B1', category: 'grammar' }, 2],
        [{ lang: 'de', level: 'B1', category: 'reading' }, 0],
      ]);
    });

    // A learner who drained the bank is exactly who needs it topped up.
    it.each([
      ['falls back to the one seen longest ago', { questionBank: row }],
      ['has nothing left to serve', null],
    ])('still asks the stock for every open category when the draw %s', async (_, oldest) => {
      const { service, prisma, stock } = serviceWith();
      prisma.userSeenQuestion.findFirst.mockResolvedValue(oldest);
      const session = examSession({ askedPerCategory: { grammar: 2, vocabulary: 0, reading: 0 } });

      await Promise.allSettled([service.getNewQuestion('u-1', session)]);

      expect(stock.restock.mock.calls).toEqual([
        [{ lang: 'de', level: 'B1', category: 'vocabulary' }, 0],
        [{ lang: 'de', level: 'B1', category: 'reading' }, 0],
      ]);
    });

    // The take caps the count the stock sees. At or below its threshold, a full
    // cell would be restocked on every draw.
    it('takes more unseen rows than the stock restocks at, so a full cell is left alone', async () => {
      const llm = { generateStructured: vi.fn() };
      const stock = new QuestionStockService({} as PrismaService, llm as unknown as LlmProvider);

      await expect(
        stock.restock(
          { lang: 'de', level: 'B1', category: 'grammar' },
          LIMIT_UNSEEN_QUESTIONS_TO_RETRIEVE,
        ),
      ).resolves.toEqual({ status: 'stocked', inserted: 0 });
      expect(llm.generateStructured).not.toHaveBeenCalled();
    });

    it('throws placement.poolExhausted when the level has nothing left to serve', async () => {
      await expect(serviceWith().service.getNewQuestion('u-1', examSession())).rejects.toThrow(
        new NotFoundException('placement.poolExhausted'),
      );
    });

    it.each([
      ['has ended', { ended: true }],
      ['has no level', { level: null }],
    ])('refuses to draw for a run that %s with placement.expired', async (_, state) => {
      await expect(serviceWith().service.getNewQuestion('u-1', examSession(state))).rejects.toThrow(
        new ConflictException('placement.expired'),
      );
    });
  });

  // 0.99 keeps every item in place, which an off-by-one shuffle never does: it
  // could then never show the answer, listed first in the bank, in first place.
  it.each([
    [0, ['hat', 'war', 'wird', 'ist']],
    [0.99, ['ist', 'hat', 'war', 'wird']],
  ])('shuffles the options in the order Math.random gives (%s)', (random, expected) => {
    vi.spyOn(Math, 'random').mockReturnValue(random);

    expect(serviceWith().service.shuffleOptions(row.options)).toEqual(expected);
  });

  describe('getMaxQuestionsRemaining', () => {
    it.each<[string, Partial<ExamSession>, number]>([
      ['at the start', {}, 18],
      ['halfway through B1', { askedPerCategory: { grammar: 2, vocabulary: 1, reading: 0 } }, 15],
      [
        'two into C1 after passing B1',
        { lo: 3, level: 4, askedPerCategory: { grammar: 1, vocabulary: 1, reading: 0 } },
        10,
      ],
      ['at A2 after failing B1', { hi: 2, level: 1 }, 12],
      [
        'on the last question at A1',
        { hi: 1, level: 0, askedPerCategory: { grammar: 2, vocabulary: 2, reading: 1 } },
        1,
      ],
    ])('counts the worst case %s', (_, state, expected) => {
      expect(serviceWith().service.getMaxQuestionsRemaining(examSession(state))).toBe(expected);
    });

    it('throws placement.invalidSession for a stored run without a level', () => {
      expect(() =>
        serviceWith().service.getMaxQuestionsRemaining(examSession({ level: null })),
      ).toThrow(new ConflictException('placement.invalidSession'));
    });
  });

  describe('createPlacementQuestion', () => {
    const served = ['war', 'wird', 'ist', 'hat'];

    it('sends the served option order, the clock and the progress, never the answer', async () => {
      // Pinned so a reshuffle could never land on `served` by chance.
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const session = examSession({
        askedPerCategory: { grammar: 1, vocabulary: 0, reading: 0 },
        totalAnswered: 1,
        currentOptions: served,
        servedAt: new Date(Date.now() - 5_000).toISOString(),
      });

      await expect(serviceWith().service.createPlacementQuestion(row, session)).resolves.toEqual({
        lang: 'de',
        questionId: row.id,
        category: 'grammar',
        level: 'B1',
        question: row.question,
        options: served,
        timeLimitS: 30,
        remainingS: 25,
        progress: { answered: 1, maxQuestionsRemaining: 17 },
      });
    });

    it('sends the text of a reading question', async () => {
      const reading = questionRow({ category: 'reading' });
      const session = examSession({ currentOptions: served });

      const question = await serviceWith().service.createPlacementQuestion(reading, session);

      expect(question.readText).toBe(reading.readText);
    });

    it('throws placement.invalidSession when no options were served', async () => {
      await expect(
        serviceWith().service.createPlacementQuestion(row, examSession()),
      ).rejects.toThrow(new ConflictException('placement.invalidSession'));
    });
  });

  it('serves a new row: marks it seen, shuffles its options once and restarts the clock', async () => {
    const { service, prisma } = serviceWith({ grammar: [row] });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const session = examSession({ servedAt: '2026-09-20T16:00:00.000Z' });

    const question = await service.getNewPlacementQuestion('u-1', session);

    expect(prisma.userSeenQuestion.upsert).toHaveBeenCalledWith({
      where: { userId_questionId: { userId: 'u-1', questionId: row.id } },
      create: { userId: 'u-1', questionId: row.id },
      update: { updatedAt: new Date() },
    });
    expect(session).toMatchObject({
      currentQuestionId: row.id,
      currentOptions: ['hat', 'war', 'wird', 'ist'],
      servedAt: new Date().toISOString(),
    });
    expect(question).toMatchObject({ questionId: row.id, options: session.currentOptions });
  });
});
