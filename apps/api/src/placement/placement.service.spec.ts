import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExamSession } from '@ft/shared';

import type { QuestionBank } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import { PlacementSessionService } from './placement-session.service';
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
    userSeenQuestion: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      ...((prismaOverrides.userSeenQuestion as Record<string, unknown>) ?? {}),
    },
    ...prismaOverrides,
  };

  const redis = {
    client: {
      exists: vi.fn().mockResolvedValue(0),
      hGetAll: vi.fn().mockResolvedValue({}),
      hSet: vi.fn().mockResolvedValue(1),
      del: vi.fn().mockResolvedValue(1),
      sAdd: vi.fn().mockResolvedValue(1),
      sMembers: vi.fn().mockResolvedValue([]),
      expire: vi.fn().mockResolvedValue(1),
      ...redisClientOverrides,
    },
  };

  const sessionService = new PlacementSessionService(redis as unknown as RedisService);

  return {
    service: new PlacementService(prisma as unknown as PrismaService, sessionService),
    sessionService,
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

    it('returns [0, random question] from last 10 seen questions when unseen pool is empty', async () => {
      prisma.questionBank.findMany.mockResolvedValue([]);
      prisma.userSeenQuestion.findMany.mockResolvedValue([
        { id: 'seen-1', questionBank: mockQuestion, createdAt: new Date() },
      ]);

      const [count, question] = await service.getNewQuestion('user-1', session);
      expect(count).toBe(0);
      expect(question).toEqual(mockQuestion);
      expect(prisma.userSeenQuestion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
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
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date(Date.now() - 5000).toISOString(),
      };

      const result = await service.createPlacementQuestion(mockQuestion, session);
      expect(result.questionId).toBe(mockQuestion.id);
      expect(result.question).toBe(mockQuestion.question);
      expect(result.remainingS).toBeLessThanOrEqual(30);
      expect(result.progress).toEqual({ answered: 1, total: 17 });
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
        ended: false,
        currentQuestionId: null,
        servedAt: new Date().toISOString(),
      };
      expect(service.getMaxQuestionsRemaining(session)).toBe(3);
    });

    it('returns at least 1 even if all questions in level are asked and bounds converged', () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'C2',
        hi: 'C2',
        level: 'C2',
        mistakesPerLevel: 1,
        askedPerCategory: { grammar: 2, vocabulary: 2, reading: 2 },
        ended: false,
        currentQuestionId: null,
        servedAt: new Date().toISOString(),
      };
      expect(service.getMaxQuestionsRemaining(session)).toBe(1);
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
      expect(prisma.userSeenQuestion.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          questionId: mockQuestion.id,
        },
      });
      expect(redis.client.hSet).toHaveBeenCalled();
      expect(redis.client.sAdd).toHaveBeenCalledWith(
        'user:user-1:eval_questions',
        JSON.stringify({ questionId: mockQuestion.id, choice: null }),
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
        ended: 'false',
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      });
      prisma.questionBank.findUnique.mockResolvedValue(mockQuestion);

      const result = await service.getPlacement('user-1');
      expect('questionId' in result && result.questionId).toBe(mockQuestion.id);
    });

    it('handles timeout when elapsed time exceeds question limit', async () => {
      redis.client.hGetAll.mockResolvedValue({
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: '0',
        askedPerCategory: JSON.stringify({ grammar: 0, vocabulary: 0, reading: 0 }),
        ended: 'false',
        currentQuestionId: mockQuestion.id,
        servedAt: new Date(Date.now() - 60000).toISOString(),
      });
      prisma.questionBank.findUnique.mockResolvedValue(mockQuestion);
      prisma.questionBank.findMany.mockResolvedValue([mockQuestion]);

      const result = await service.getPlacement('user-1');
      expect('questionId' in result && result.questionId).toBe(mockQuestion.id);
      expect(redis.client.sAdd).toHaveBeenCalledWith(
        'user:user-1:eval_questions',
        JSON.stringify({ questionId: mockQuestion.id, choice: null }),
      );
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
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };

      await service.adjustSessionFromAnswer('ist', mockQuestion, session);
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
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };

      await service.adjustSessionFromAnswer('wrong', mockQuestion, session);
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
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };

      await service.adjustSessionFromAnswer('ist', mockQuestion, session);
      expect(session.mistakesPerLevel).toBe(0);
      expect(session.lo).toBe('B1');
      expect(session.level).toBe('C1');
      expect(session.askedPerCategory).toEqual({ grammar: 0, vocabulary: 0, reading: 0 });
    });
  });

  describe('getTimeOut', () => {
    it('archives timeout answer and returns new question', async () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };
      prisma.questionBank.findMany.mockResolvedValue([mockQuestion]);

      const result = await service.getTimeOut('user-1', mockQuestion, session);
      expect('questionId' in result && result.questionId).toBe(mockQuestion.id);
      expect(redis.client.sAdd).toHaveBeenCalledWith(
        'user:user-1:eval_questions',
        JSON.stringify({ questionId: mockQuestion.id, choice: null }),
      );
    });
  });

  describe('quitPlacement', () => {
    it('removes redis session and question set keys', async () => {
      await service.quitPlacement('user-1');

      expect(redis.client.del).toHaveBeenCalledWith([
        'user:user-1:eval',
        'user:user-1:eval_questions',
      ]);
    });
  });

  describe('submitAnswer', () => {
    it('returns current question if submitted questionId does not match', async () => {
      redis.client.hGetAll.mockResolvedValue({
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: '0',
        askedPerCategory: JSON.stringify({ grammar: 0, vocabulary: 0, reading: 0 }),
        ended: 'false',
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      });
      prisma.questionBank.findUnique.mockResolvedValue(mockQuestion);

      const result = await service.submitAnswer('user-1', {
        questionId: 'mismatched-id',
        choice: 'ist',
      });
      expect('questionId' in result && result.questionId).toBe(mockQuestion.id);
    });

    it('delegates to getTimeOut if submitted after time limit', async () => {
      redis.client.hGetAll.mockResolvedValue({
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: '0',
        askedPerCategory: JSON.stringify({ grammar: 0, vocabulary: 0, reading: 0 }),
        ended: 'false',
        currentQuestionId: mockQuestion.id,
        servedAt: new Date(Date.now() - 60000).toISOString(),
      });
      prisma.questionBank.findUnique.mockResolvedValue(mockQuestion);
      prisma.questionBank.findMany.mockResolvedValue([mockQuestion]);

      const result = await service.submitAnswer('user-1', {
        questionId: mockQuestion.id,
        choice: 'ist',
      });
      expect('questionId' in result && result.questionId).toBe(mockQuestion.id);
      expect(redis.client.sAdd).toHaveBeenCalledWith(
        'user:user-1:eval_questions',
        JSON.stringify({ questionId: mockQuestion.id, choice: null }),
      );
    });

    it('processes answer and returns next question', async () => {
      redis.client.hGetAll.mockResolvedValue({
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: '0',
        askedPerCategory: JSON.stringify({ grammar: 0, vocabulary: 0, reading: 0 }),
        ended: 'false',
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      });
      prisma.questionBank.findUnique.mockResolvedValue(mockQuestion);
      prisma.questionBank.findMany.mockResolvedValue([mockQuestion]);

      const result = await service.submitAnswer('user-1', {
        questionId: mockQuestion.id,
        choice: 'ist',
      });
      expect('questionId' in result && result.questionId).toBe(mockQuestion.id);
    });
  });
});
