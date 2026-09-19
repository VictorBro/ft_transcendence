import { NotFoundException } from '@nestjs/common';
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

  beforeEach(() => {
    const created = createService();
    service = created.service;
    prisma = created.prisma;
  });

  describe('targetLevelToCEFRLevel', () => {
    it('returns valid CEFR level', () => {
      expect(service.targetLevelToCEFRLevel('B1')).toBe('B1');
    });

    it('asserts when level is C3', () => {
      expect(() => service.targetLevelToCEFRLevel('C3')).toThrow();
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

    it('checks another eligible category if first category has no unseen questions', async () => {
      prisma.questionBank.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([mockQuestion]);

      const [count, question] = await service.getNewQuestion('user-1', session);
      expect(count).toBe(0);
      expect(question).toEqual(mockQuestion);
      expect(prisma.questionBank.findMany).toHaveBeenCalledTimes(2);
      expect(prisma.userSeenQuestion.findMany).not.toHaveBeenCalled();
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
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { questionBank: true },
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

    it('returns 0 when all questions in level are asked and bounds converged', () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'C2',
        hi: 'C2',
        level: 'C2',
        mistakesPerLevel: 1,
        askedPerCategory: { grammar: 2, vocabulary: 2, reading: 2 },
        totalAnswered: 6,
        ended: false,
        currentQuestionId: null,
        servedAt: new Date().toISOString(),
      };
      expect(service.getMaxQuestionsRemaining(session)).toBe(0);
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
