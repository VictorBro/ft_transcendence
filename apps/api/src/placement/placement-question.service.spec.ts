import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExamSession } from '@ft/shared';

import type { QuestionBank } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import { PlacementSessionService } from './placement-session.service';
import { PlacementQuestionService } from './placement-question.service';

const mockQuestion: QuestionBank = {
  id: 'b7c1e4a2-5d38-4f6b-9a02-1e7c8d3f5b64',
  sourceId: 'de-gram-0001',
  lang: 'de',
  level: 'B1',
  topic: 'verbs_morphology',
  category: 'grammar',
  readText: null,
  question: 'Er ___ gestern ins Kino gegangen.',
  options: ['ist', 'hat', 'war', 'wird'],
  answer: 'ist',
  timeLimitS: 30,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createService(
  prismaOverrides: Record<string, unknown> = {},
  redisClientOverrides: Record<string, unknown> = {},
) {
  const prisma = {
    questionBank: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      ...((prismaOverrides.questionBank as Record<string, unknown>) ?? {}),
    },
    userSeenQuestion: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({}),
      ...((prismaOverrides.userSeenQuestion as Record<string, unknown>) ?? {}),
    },
    ...prismaOverrides,
  };

  const redis = {
    client: {
      exists: vi.fn().mockResolvedValue(0),
      hGetAll: vi.fn().mockResolvedValue({}),
      hSet: vi.fn().mockResolvedValue(1),
      hIncrBy: vi.fn().mockResolvedValue(1),
      del: vi.fn().mockResolvedValue(1),
      rPush: vi.fn().mockResolvedValue(1),
      lRange: vi.fn().mockResolvedValue([]),
      expire: vi.fn().mockResolvedValue(1),
      ...redisClientOverrides,
    },
  };

  const sessionService = new PlacementSessionService(redis as unknown as RedisService);

  return {
    service: new PlacementQuestionService(prisma as unknown as PrismaService, sessionService),
    sessionService,
    prisma,
    redis,
  };
}

describe('PlacementQuestionService', () => {
  let service: PlacementQuestionService;
  let prisma: ReturnType<typeof createService>['prisma'];
  let redis: ReturnType<typeof createService>['redis'];

  beforeEach(() => {
    const created = createService();
    service = created.service;
    prisma = created.prisma;
    redis = created.redis;
  });

  describe('targetLevelToCEFRLevel', () => {
    it('returns valid CEFR level', () => {
      expect(service.targetLevelToCEFRLevel('B1')).toBe('B1');
    });

    it('throws ConflictException when level is C3', () => {
      expect(() => service.targetLevelToCEFRLevel('C3')).toThrow(ConflictException);
    });
  });

  describe('getNewQuestion', () => {
    const session: ExamSession = {
      lang: 'de',
      lo: 'A1',
      hi: 'C2',
      level: 'B1',
      mistakesPerLevel: 0,
      askedPerCategory: { vocabulary: 1, reading: 1, grammar: 0 },
      totalAnswered: 0,
      ended: false,
      currentQuestionId: null,
      servedAt: new Date().toISOString(),
    };

    it('queries prisma and returns count and first question', async () => {
      prisma.questionBank.findMany.mockResolvedValue([mockQuestion]);

      const [count, question] = await service.getNewQuestion('user-1', session);
      expect(count).toBe(1);
      expect(question).toEqual(mockQuestion);
      expect(prisma.questionBank.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            lang: 'de',
            level: 'B1',
          }),
        }),
      );
    });

    it('throws NotFoundException when pool is exhausted', async () => {
      prisma.questionBank.findMany.mockResolvedValue([]);

      await expect(service.getNewQuestion('user-1', session)).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when session.ended is true', async () => {
      await expect(service.getNewQuestion('user-1', { ...session, ended: true })).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws ConflictException when session.level is C3', async () => {
      await expect(service.getNewQuestion('user-1', { ...session, level: 'C3' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('checks all eligible categories and returns question from non-empty category', async () => {
      prisma.questionBank.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([mockQuestion])
        .mockResolvedValueOnce([]);

      const [count, question] = await service.getNewQuestion('user-1', session);
      expect(count).toBe(0);
      expect(question).toEqual(mockQuestion);
      expect(prisma.questionBank.findMany).toHaveBeenCalledTimes(3);
      expect(prisma.userSeenQuestion.findMany).not.toHaveBeenCalled();
    });

    it('calculates true min_questions across all categories and selects a non-empty category randomly', async () => {
      const qGrammar = { ...mockQuestion, id: 'q-gram', category: 'grammar' as const };
      const qVocab = { ...mockQuestion, id: 'q-vocab', category: 'vocabulary' as const };
      // 3 eligible categories: grammar has 10, vocabulary has 2, reading has 5
      prisma.questionBank.findMany.mockImplementation(async ({ where }) => {
        if (where.category === 'grammar') return Array(10).fill(qGrammar);
        if (where.category === 'vocabulary') return Array(2).fill(qVocab);
        return [];
      });

      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99); // picks second available category (vocabulary)
      const [minQuestions, question] = await service.getNewQuestion('user-1', session);
      expect(minQuestions).toBe(0); // reading had 0, so min across all 3 is 0
      expect(question.category).toBe('vocabulary');
      randomSpy.mockRestore();
    });

    it('returns [0, random question] from last 10 seen questions when unseen pool is empty', async () => {
      prisma.questionBank.findMany.mockResolvedValue([]);
      prisma.userSeenQuestion.findMany.mockResolvedValue([
        {
          id: 'seen-1',
          userId: 'user-1',
          questionId: mockQuestion.id,
          createdAt: new Date(),
          updatedAt: new Date(),
          questionBank: mockQuestion,
        },
      ]);

      const [count, question] = await service.getNewQuestion('user-1', session);
      expect(count).toBe(0);
      expect(question).toEqual(mockQuestion);
      expect(prisma.userSeenQuestion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            questionBank: expect.objectContaining({
              lang: 'de',
              level: 'B1',
            }),
          }),
          orderBy: { updatedAt: 'asc' },
          take: 10,
          include: { questionBank: true },
        }),
      );
    });
    it('selects randomly among multiple unseen questions', async () => {
      const q1 = { ...mockQuestion, id: 'q-1' };
      const q2 = { ...mockQuestion, id: 'q-2' };
      const q3 = { ...mockQuestion, id: 'q-3' };
      prisma.questionBank.findMany.mockResolvedValue([q1, q2, q3]);

      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.7);
      const [, question] = await service.getNewQuestion('user-1', session);
      expect(question).toEqual(q3);
      randomSpy.mockRestore();
    });

    it('excludes already answered questions and current question from fallback seen query', async () => {
      const answeredQuestionId = 'a1111111-1111-4111-8111-111111111111';
      const activeQuestionId = 'b2222222-2222-4222-8222-222222222222';

      prisma.questionBank.findMany.mockResolvedValue([]);
      redis.client.lRange.mockResolvedValue([
        JSON.stringify({ questionId: answeredQuestionId, choice: 'ist' }),
      ]);
      const sessionWithCurrent: ExamSession = {
        ...session,
        currentQuestionId: activeQuestionId,
      };

      prisma.userSeenQuestion.findMany.mockResolvedValue([
        {
          id: 'seen-1',
          userId: 'user-1',
          questionId: mockQuestion.id,
          createdAt: new Date(),
          updatedAt: new Date(),
          questionBank: mockQuestion,
        },
      ]);

      const [count, question] = await service.getNewQuestion('user-1', sessionWithCurrent);
      expect(count).toBe(0);
      expect(question).toEqual(mockQuestion);
      expect(prisma.userSeenQuestion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            questionId: { notIn: [answeredQuestionId, activeQuestionId] },
          }),
        }),
      );
    });
  });

  describe('createPlacementQuestion', () => {
    it('constructs a valid PlacementQuestion from QuestionBank and ExamSession', async () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 1, vocabulary: 0, reading: 0 },
        totalAnswered: 1,
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date(Date.now() - 5000).toISOString(),
      };

      const result = await service.createPlacementQuestion(mockQuestion, session);
      expect(result.questionId).toBe(mockQuestion.id);
      expect(result.question).toBe(mockQuestion.question);
      expect(result.remainingS).toBeLessThanOrEqual(30);
      expect(result.progress).toEqual({ answered: 1, maxRemaining: 17 });
      expect((result as Record<string, unknown>).answer).toBeUndefined();
      expect([...result.options].sort()).toEqual([...mockQuestion.options].sort());
    });

    it('produces stable option ordering for the same served question across reloads', async () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 1, vocabulary: 0, reading: 0 },
        totalAnswered: 1,
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: '2026-09-20T16:00:00.000Z',
      };

      const result1 = await service.createPlacementQuestion(mockQuestion, session);
      const result2 = await service.createPlacementQuestion(mockQuestion, session);
      expect(result1.options).toEqual(result2.options);
    });
  });

  describe('shuffleOptions', () => {
    it('preserves all items while shuffling', () => {
      const options = ['opt1', 'opt2', 'opt3', 'opt4'];
      const shuffled = service.shuffleOptions(options);
      expect([...shuffled].sort()).toEqual([...options].sort());
      expect(shuffled).toHaveLength(4);
    });

    it('returns deterministic output when seed is provided', () => {
      const options = ['opt1', 'opt2', 'opt3', 'opt4'];
      const shuffled1 = service.shuffleOptions(options, 'seed-abc');
      const shuffled2 = service.shuffleOptions(options, 'seed-abc');
      expect(shuffled1).toEqual(shuffled2);
    });
  });

  describe('getMaxQuestionsRemaining', () => {
    it('calculates remaining questions for initial B1 session', () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 0,
        ended: false,
        currentQuestionId: null,
        servedAt: new Date().toISOString(),
      };
      expect(service.getMaxQuestionsRemaining(session)).toBe(18);
    });

    it('calculates remaining questions for narrowed boundary level A1', () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'A1',
        hi: 'A1',
        level: 'A1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 1, vocabulary: 1, reading: 1 },
        totalAnswered: 3,
        ended: false,
        currentQuestionId: null,
        servedAt: new Date().toISOString(),
      };
      expect(service.getMaxQuestionsRemaining(session)).toBe(3);
    });

    it('calculates remaining questions on final question of converged final level', () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'A1',
        hi: 'A2',
        level: 'A1',
        mistakesPerLevel: 1,
        askedPerCategory: { grammar: 2, vocabulary: 2, reading: 1 },
        totalAnswered: 17,
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };
      expect(service.getMaxQuestionsRemaining(session)).toBe(1);
    });

    it('calculates remaining questions mid-level with upper branch exploration remaining', () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'B2',
        hi: 'C3',
        level: 'C1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 1, vocabulary: 1, reading: 0 },
        totalAnswered: 8,
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };
      expect(service.getMaxQuestionsRemaining(session)).toBe(10);
    });

    it('calculates remaining questions when probing top level C2', () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'C2',
        hi: 'C3',
        level: 'C2',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 1, vocabulary: 0, reading: 0 },
        totalAnswered: 13,
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };
      expect(service.getMaxQuestionsRemaining(session)).toBe(5);
    });

    it('calculates remaining questions after stepping down to A2', () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'A1',
        hi: 'B1',
        level: 'A2',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 2,
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };
      expect(service.getMaxQuestionsRemaining(session)).toBe(12);
    });

    it('calculates remaining questions halfway through initial B1 level', () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'A1',
        hi: 'C3',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 2, vocabulary: 1, reading: 0 },
        totalAnswered: 3,
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };
      expect(service.getMaxQuestionsRemaining(session)).toBe(15);
    });
  });

  describe('getNewPlacementQuestion', () => {
    it('fetches new question and registers seen question', async () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 0,
        ended: false,
        currentQuestionId: null,
        servedAt: new Date().toISOString(),
      };
      prisma.questionBank.findMany.mockResolvedValue([mockQuestion]);

      const result = await service.getNewPlacementQuestion('user-1', session);
      expect(result.questionId).toBe(mockQuestion.id);
      expect(prisma.userSeenQuestion.upsert).toHaveBeenCalledWith({
        where: {
          userId_questionId: {
            userId: 'user-1',
            questionId: mockQuestion.id,
          },
        },
        create: {
          userId: 'user-1',
          questionId: mockQuestion.id,
        },
        update: {
          updatedAt: expect.any(Date),
        },
      });
    });
  });
});
