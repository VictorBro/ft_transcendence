import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExamSession } from '@ft/shared';

import type { QuestionBank } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import { PlacementService } from './placement.service';

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
    ...prismaOverrides,
  };

  const redis = {
    client: {
      exists: vi.fn().mockResolvedValue(0),
      hSet: vi.fn().mockResolvedValue(1),
      hGetAll: vi.fn().mockResolvedValue({}),
      del: vi.fn().mockResolvedValue(1),
      sAdd: vi.fn().mockResolvedValue(1),
      sMembers: vi.fn().mockResolvedValue([]),
      expire: vi.fn().mockResolvedValue(1),
      ...redisClientOverrides,
    },
  };

  return {
    service: new PlacementService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
    ),
    prisma,
    redis,
  };
}

describe('PlacementService', () => {
  let service: PlacementService;
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

  describe('getNewQuestion', () => {
    const session: ExamSession = {
      lang: 'de',
      lo: 'A1',
      hi: 'C2',
      level: 'B1',
      mistakesPerLevel: 0,
      askedPerCategory: { vocabulary: 1, reading: 1, grammar: 0 },
      total_asked: 2,
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
        total_asked: 1,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date(Date.now() - 5000).toISOString(),
      };

      const result = await service.createPlacementQuestion(mockQuestion, session);
      expect(result.questionId).toBe(mockQuestion.id);
      expect(result.question).toBe(mockQuestion.question);
      expect(result.remainingS).toBeLessThanOrEqual(30);
      expect(result.progress).toEqual({ answered: 1, total: 6 });
      expect((result as Record<string, unknown>).answer).toBeUndefined();
    });
  });

  describe('startPlacement', () => {
    it('throws ConflictException if placement is already in progress', async () => {
      redis.client.exists.mockResolvedValue(1);

      await expect(service.startPlacement('user-1', { lang: 'de' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('initializes session and returns first question', async () => {
      redis.client.exists.mockResolvedValue(0);
      prisma.questionBank.findMany.mockResolvedValue([mockQuestion]);

      const result = await service.startPlacement('user-1', { lang: 'de' });
      expect(result.questionId).toBe(mockQuestion.id);
      expect(redis.client.hSet).toHaveBeenCalled();
      expect(redis.client.sAdd).toHaveBeenCalledWith(
        'session:user-1:eval_questions',
        mockQuestion.id,
      );
    });
  });

  describe('getPlacement', () => {
    it('throws NotFoundException if no active session in redis', async () => {
      redis.client.hGetAll.mockResolvedValue({});

      await expect(service.getPlacement('user-1')).rejects.toThrow(NotFoundException);
    });

    it('returns the active placement question', async () => {
      redis.client.hGetAll.mockResolvedValue({
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: '0',
        askedPerCategory: JSON.stringify({ grammar: 1, vocabulary: 0, reading: 0 }),
        total_asked: '1',
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      });
      prisma.questionBank.findUnique.mockResolvedValue(mockQuestion);

      const result = await service.getPlacement('user-1');
      expect(result.questionId).toBe(mockQuestion.id);
    });
  });

  describe('quitPlacement', () => {
    it('removes redis session and question set keys', async () => {
      await service.quitPlacement('user-1');

      expect(redis.client.del).toHaveBeenCalledWith([
        'session:user-1:eval',
        'session:user-1:eval_questions',
      ]);
    });
  });

  describe('submitAnswer', () => {
    it('resolves without error', async () => {
      await expect(
        service.submitAnswer('user-1', {
          questionId: mockQuestion.id,
          choice: 'ist',
        }),
      ).resolves.toBeUndefined();
    });
  });
});
