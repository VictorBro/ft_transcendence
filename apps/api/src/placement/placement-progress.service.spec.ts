import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExamSession } from '@ft/shared';

import type { QuestionBank } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import { PlacementSessionService } from './placement-session.service';
import { NETWORK_GRACE_S, PlacementProgressService } from './placement-progress.service';

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
    userLevel: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      ...((prismaOverrides.userLevel as Record<string, unknown>) ?? {}),
    },
    user: {
      update: vi.fn().mockResolvedValue({}),
      ...((prismaOverrides.user as Record<string, unknown>) ?? {}),
    },
    $transaction: vi.fn().mockImplementation((args) => Promise.all(args)),
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
    service: new PlacementProgressService(prisma as unknown as PrismaService, sessionService),
    sessionService,
    prisma,
    redis,
  };
}

describe('PlacementProgressService', () => {
  let service: PlacementProgressService;
  let prisma: ReturnType<typeof createService>['prisma'];
  let redis: ReturnType<typeof createService>['redis'];

  beforeEach(() => {
    const created = createService();
    service = created.service;
    prisma = created.prisma;
    redis = created.redis;
  });

  describe('getQuestion', () => {
    it('returns question when found', async () => {
      prisma.questionBank.findUnique.mockResolvedValue(mockQuestion);

      const result = await service.getQuestion(mockQuestion.id);
      expect(result).toEqual(mockQuestion);
      expect(prisma.questionBank.findUnique).toHaveBeenCalledWith({
        where: { id: mockQuestion.id },
      });
    });

    it('throws NotFoundException when question not found', async () => {
      prisma.questionBank.findUnique.mockResolvedValue(null);

      await expect(service.getQuestion('missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateUserLevel', () => {
    it('updates user level and activeLang in transaction', async () => {
      await service.updateUserLevel('user-1', 'de', 'B1');
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.userLevel.update).toHaveBeenCalledWith({
        where: {
          userId_lang: {
            userId: 'user-1',
            lang: 'de',
          },
        },
        data: {
          level: 'B1',
        },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { activeLang: 'de' },
      });
    });
  });

  describe('checkOnboardingCompleted', () => {
    it('returns true when userLevel exists for user and language', async () => {
      prisma.userLevel.findUnique.mockResolvedValue({ id: 'ul-1' });

      const result = await service.checkOnboardingCompleted('user-1', 'de');
      expect(result).toBe(true);
      expect(prisma.userLevel.findUnique).toHaveBeenCalledWith({
        where: {
          userId_lang: {
            userId: 'user-1',
            lang: 'de',
          },
        },
        select: { id: true },
      });
    });

    it('returns false when userLevel does not exist', async () => {
      prisma.userLevel.findUnique.mockResolvedValue(null);

      const result = await service.checkOnboardingCompleted('user-1', 'fr');
      expect(result).toBe(false);
      expect(prisma.userLevel.findUnique).toHaveBeenCalledWith({
        where: {
          userId_lang: {
            userId: 'user-1',
            lang: 'fr',
          },
        },
        select: { id: true },
      });
    });
  });

  describe('adjustSessionFromAnswer', () => {
    it('increments category count on correct answer', async () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 0,
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };

      await service.adjustSessionFromAnswer('ist', mockQuestion, session, 'user-1');
      expect(session.mistakesPerLevel).toBe(0);
      expect(session.askedPerCategory.grammar).toBe(1);
      expect(session.level).toBe('B1');
    });

    it('drops level when mistakes reach 2', async () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 1,
        askedPerCategory: { grammar: 1, vocabulary: 0, reading: 0 },
        totalAnswered: 1,
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };

      await service.adjustSessionFromAnswer('wrong', mockQuestion, session, 'user-1');
      expect(session.mistakesPerLevel).toBe(0);
      expect(session.hi).toBe('B1');
      expect(session.level).toBe('A2');
      expect(session.askedPerCategory).toEqual({ grammar: 0, vocabulary: 0, reading: 0 });
    });

    it('advances level when level questions are completed', async () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 2, vocabulary: 2, reading: 1 },
        totalAnswered: 5,
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };

      await service.adjustSessionFromAnswer('ist', mockQuestion, session, 'user-1');
      expect(session.mistakesPerLevel).toBe(0);
      expect(session.lo).toBe('B2');
      expect(session.level).toBe('C1');
      expect(session.askedPerCategory).toEqual({ grammar: 0, vocabulary: 0, reading: 0 });
    });

    it('ends exam with upper boundary level when completing questions at highest level (currIndex === hiIndex - 1)', async () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'C2',
        hi: 'C3',
        level: 'C2',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 2, vocabulary: 2, reading: 1 },
        totalAnswered: 17,
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };

      await service.adjustSessionFromAnswer('ist', mockQuestion, session, 'user-1');
      expect(session.ended).toBe(true);
      expect(session.level).toBe('C3');
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.userLevel.update).toHaveBeenCalledWith({
        where: {
          userId_lang: {
            userId: 'user-1',
            lang: 'de',
          },
        },
        data: {
          level: 'C3',
        },
      });
    });

    it('ends exam with lower boundary level when failing at lowest level (currIndex === loIndex)', async () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'A1',
        hi: 'A2',
        level: 'A1',
        mistakesPerLevel: 1,
        askedPerCategory: { grammar: 1, vocabulary: 0, reading: 0 },
        totalAnswered: 7,
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };

      await service.adjustSessionFromAnswer('wrong', mockQuestion, session, 'user-1');
      expect(session.ended).toBe(true);
      expect(session.level).toBe('A1');
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.userLevel.update).toHaveBeenCalledWith({
        where: {
          userId_lang: {
            userId: 'user-1',
            lang: 'de',
          },
        },
        data: {
          level: 'A1',
        },
      });
    });
  });

  describe('hasTimedOut', () => {
    it('returns true when elapsed exceeds time limit plus network grace', () => {
      const servedAt = new Date(
        Date.now() - (mockQuestion.timeLimitS + NETWORK_GRACE_S + 2) * 1000,
      ).toISOString();
      expect(service.hasTimedOut(mockQuestion, servedAt)).toBe(true);
    });

    it('returns false when elapsed exceeds time limit but is within network grace', () => {
      const servedAt = new Date(Date.now() - (mockQuestion.timeLimitS + 1) * 1000).toISOString();
      expect(service.hasTimedOut(mockQuestion, servedAt)).toBe(false);
    });

    it('returns false when elapsed is within time limit', () => {
      const servedAt = new Date().toISOString();
      expect(service.hasTimedOut(mockQuestion, servedAt)).toBe(false);
    });
  });

  describe('getResult', () => {
    it('returns undefined if session is not ended', async () => {
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

      const result = await service.getResult('user-1', session);
      expect(result).toBeUndefined();
    });

    it('returns PlacementResult with report when session is ended', async () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 2,
        ended: true,
        currentQuestionId: null,
        servedAt: new Date().toISOString(),
      };

      const q2 = {
        ...mockQuestion,
        id: '22222222-2222-4222-8222-222222222222',
        question: 'Second question?',
        answer: 'Haus',
        options: ['Haus', 'Baum', 'Auto', 'Zug'],
      };

      redis.client.lRange.mockResolvedValue([
        JSON.stringify({ questionId: mockQuestion.id, choice: 'ist' }),
        JSON.stringify({ questionId: q2.id, choice: null }),
      ]);
      prisma.questionBank.findMany.mockResolvedValue([mockQuestion, q2]);

      const result = await service.getResult('user-1', session);
      expect(result).toBeDefined();
      expect(result?.targetLevel).toBe('B1');
      expect(result?.report).toHaveLength(2);
      expect(result?.report).toEqual([
        {
          questionId: mockQuestion.id,
          question: mockQuestion.question,
          options: mockQuestion.options,
          chosen: 'ist',
          correct: 'ist',
          wasCorrect: true,
        },
        {
          questionId: q2.id,
          question: q2.question,
          options: q2.options,
          chosen: null,
          correct: 'Haus',
          wasCorrect: false,
        },
      ]);
    });
  });
});
