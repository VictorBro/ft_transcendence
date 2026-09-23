import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExamSession, SubmitAnswerInput } from '@ft/shared';

import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import { PLACEMENT_REDIS_KEY_TTL, PlacementSessionService } from './placement-session.service';

function createSessionService(redisClientOverrides: Record<string, unknown> = {}) {
  const multiMock = {
    hSet: vi.fn().mockReturnThis(),
    hGetAll: vi.fn().mockReturnThis(),
    lRange: vi.fn().mockReturnThis(),
    rPush: vi.fn().mockReturnThis(),
    del: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  };

  const redis = {
    client: {
      exists: vi.fn().mockResolvedValue(0),
      hSet: vi.fn().mockResolvedValue(1),
      hGetAll: vi.fn().mockResolvedValue({}),
      hIncrBy: vi.fn().mockResolvedValue(1),
      del: vi.fn().mockResolvedValue(1),
      rPush: vi.fn().mockResolvedValue(1),
      lRange: vi.fn().mockResolvedValue([]),
      expire: vi.fn().mockResolvedValue(1),
      set: vi.fn().mockResolvedValue('OK'),
      eval: vi.fn().mockResolvedValue(1),
      multi: vi.fn(() => multiMock),
      ...redisClientOverrides,
    },
  };
  multiMock.exec.mockImplementation(async () =>
    Promise.all([
      redis.client.hGetAll('user:u-1:eval'),
      redis.client.lRange('user:u-1:eval_questions', 0, -1),
    ]),
  );

  const prisma = {
    userLevel: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  };

  return {
    service: new PlacementSessionService(
      redis as unknown as RedisService,
      prisma as unknown as PrismaService,
    ),
    redis,
    prisma,
    multiMock,
  };
}

describe('PlacementSessionService', () => {
  let service: PlacementSessionService;
  let redis: ReturnType<typeof createSessionService>['redis'];
  let prisma: ReturnType<typeof createSessionService>['prisma'];
  let multiMock: ReturnType<typeof createSessionService>['multiMock'];

  beforeEach(() => {
    const created = createSessionService();
    service = created.service;
    redis = created.redis;
    prisma = created.prisma;
    multiMock = created.multiMock;
  });

  const sampleSession: ExamSession = {
    evalId: 'd7c1e4a2-5d38-4f6b-9a02-1e7c8d3f5b64',
    lang: 'de',
    lo: 'A1',
    hi: 'C2',
    level: 'B1',
    mistakesPerLevel: 0,
    askedPerCategory: { grammar: 1, vocabulary: 0, reading: 0 },
    totalAnswered: 0,
    answers: [],
    ended: false,
    currentQuestionId: 'b7c1e4a2-5d38-4f6b-9a02-1e7c8d3f5b64',
    servedAt: '2026-09-18T19:00:00.000Z',
  };

  it('generates consistent eval, eval_questions, and eval_lock keys', () => {
    expect(service.evalKey('u-1')).toBe('user:u-1:eval');
    expect(service.evalQuestionsKey('u-1')).toBe('user:u-1:eval_questions');
    expect(service.evalLockKey('u-1')).toBe('user:u-1:eval_lock');
  });

  describe('acquireLock', () => {
    it('returns an ownership token when lock is successfully acquired', async () => {
      redis.client.set.mockResolvedValue('OK');
      const result = await service.acquireLock('u-1');
      expect(result).toEqual(expect.any(String));
      expect(redis.client.set).toHaveBeenCalledWith('user:u-1:eval_lock', result, {
        NX: true,
        EX: 5,
      });
    });

    it('renews an acquired lock before its lease expires', async () => {
      vi.useFakeTimers();
      redis.client.eval.mockResolvedValue(1);
      let token: string | null = null;

      try {
        token = await service.acquireLock('u-1', 3);
        await vi.advanceTimersByTimeAsync(1000);

        expect(redis.client.eval).toHaveBeenCalledWith(expect.stringContaining('EXPIRE'), {
          keys: ['user:u-1:eval_lock'],
          arguments: [token, '3'],
        });
      } finally {
        if (token) await service.releaseLock('u-1', token);
        vi.useRealTimers();
      }
    });

    it('returns null when lock already exists', async () => {
      redis.client.set.mockResolvedValue(null);
      const result = await service.acquireLock('u-1');
      expect(result).toBeNull();
    });
  });

  describe('releaseLock', () => {
    it('conditionally deletes only the lock owned by the supplied token', async () => {
      await service.releaseLock('u-1', 'token-a');

      expect(redis.client.eval).toHaveBeenCalledWith(expect.stringContaining('GET'), {
        keys: ['user:u-1:eval_lock'],
        arguments: ['token-a'],
      });
      expect(redis.client.del).not.toHaveBeenCalled();
    });
  });

  describe('extendLock', () => {
    it('extends only the lock owned by the supplied token', async () => {
      redis.client.eval.mockResolvedValue(1);

      await expect(service.extendLock('u-1', 'token-a', 9)).resolves.toBe(true);
      expect(redis.client.eval).toHaveBeenCalledWith(expect.stringContaining('EXPIRE'), {
        keys: ['user:u-1:eval_lock'],
        arguments: ['token-a', '9'],
      });
    });

    it('reports loss of lock ownership', async () => {
      redis.client.eval.mockResolvedValue(0);
      await expect(service.extendLock('u-1', 'stale-token')).resolves.toBe(false);
    });
  });

  describe('acquireLockWithRetry', () => {
    it('returns a token immediately if lock is acquired on first attempt', async () => {
      redis.client.set.mockResolvedValue('OK');
      const result = await service.acquireLockWithRetry('u-1', 2, 1);
      expect(result).toEqual(expect.any(String));
      expect(redis.client.set).toHaveBeenCalledTimes(1);
    });

    it('returns a token after retrying if lock is initially held', async () => {
      redis.client.set.mockResolvedValueOnce(null).mockResolvedValueOnce('OK');
      const result = await service.acquireLockWithRetry('u-1', 2, 1);
      expect(result).toEqual(expect.any(String));
      expect(redis.client.set).toHaveBeenCalledTimes(2);
    });

    it('returns null if lock cannot be acquired after max retries', async () => {
      redis.client.set.mockResolvedValue(null);
      const result = await service.acquireLockWithRetry('u-1', 2, 1);
      expect(result).toBeNull();
      expect(redis.client.set).toHaveBeenCalledTimes(3);
    });
  });

  describe('hasActiveSession', () => {
    it('returns true when session exists in redis', async () => {
      redis.client.exists.mockResolvedValue(1);
      const result = await service.hasActiveSession('u-1');
      expect(result).toBe(true);
      expect(redis.client.exists).toHaveBeenCalledWith('user:u-1:eval');
    });

    it('returns false when session does not exist', async () => {
      redis.client.exists.mockResolvedValue(0);
      const result = await service.hasActiveSession('u-1');
      expect(result).toBe(false);
    });
  });

  describe('saveExamSession', () => {
    it('stores session data into redis hash with TTL within a multi transaction', async () => {
      await service.saveExamSession('u-1', sampleSession);

      expect(redis.client.multi).toHaveBeenCalled();
      expect(multiMock.hSet).toHaveBeenCalledWith('user:u-1:eval', {
        evalId: sampleSession.evalId,
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: '0',
        askedPerCategory: JSON.stringify(sampleSession.askedPerCategory),
        totalAnswered: '0',
        ended: 'false',
        currentQuestionId: sampleSession.currentQuestionId,
        servedAt: sampleSession.servedAt,
      });
      expect(multiMock.expire).toHaveBeenCalledWith('user:u-1:eval', PLACEMENT_REDIS_KEY_TTL);
      expect(multiMock.del).toHaveBeenCalledWith('user:u-1:eval_questions');
      expect(multiMock.rPush).not.toHaveBeenCalled();
      expect(multiMock.exec).toHaveBeenCalled();
    });
  });

  describe('loadExamSession', () => {
    it('returns null when no data in redis', async () => {
      redis.client.hGetAll.mockResolvedValue({});
      const result = await service.loadExamSession('u-1');
      expect(result).toBeNull();
      expect(multiMock.hGetAll).toHaveBeenCalledWith('user:u-1:eval');
      expect(multiMock.lRange).toHaveBeenCalledWith('user:u-1:eval_questions', 0, -1);
    });

    it('parses and returns valid ExamSession', async () => {
      redis.client.hGetAll.mockResolvedValue({
        evalId: sampleSession.evalId,
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: '0',
        askedPerCategory: JSON.stringify({ grammar: 1, vocabulary: 0, reading: 0 }),
        totalAnswered: '0',
        ended: 'false',
        currentQuestionId: sampleSession.currentQuestionId,
        servedAt: sampleSession.servedAt,
      });

      const result = await service.loadExamSession('u-1');
      expect(result).toEqual(sampleSession);
      expect(prisma.userLevel.findUnique).toHaveBeenCalledWith({
        where: {
          userId_lang: {
            userId: 'u-1',
            lang: 'de',
          },
        },
        select: {
          lastEvalSessionId: true,
          lastEvalLevel: true,
        },
      });
    });

    it('restores an authoritative completed level from a matching database marker', async () => {
      redis.client.hGetAll.mockResolvedValue({
        evalId: sampleSession.evalId,
        lang: 'de',
        lo: 'A1',
        hi: 'C3',
        level: 'C2',
        mistakesPerLevel: '0',
        askedPerCategory: JSON.stringify({ grammar: 2, vocabulary: 2, reading: 1 }),
        totalAnswered: '17',
        ended: 'false',
        currentQuestionId: sampleSession.currentQuestionId,
        servedAt: sampleSession.servedAt,
      });
      prisma.userLevel.findUnique.mockResolvedValue({
        lastEvalSessionId: sampleSession.evalId,
        lastEvalLevel: 'C3',
      });

      const result = await service.loadExamSession('u-1');

      expect(result).toEqual(
        expect.objectContaining({
          ended: true,
          level: 'C3',
        }),
      );
    });

    it('marks a matching null-level abort as ended with level null', async () => {
      redis.client.hGetAll.mockResolvedValue({
        evalId: sampleSession.evalId,
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: '0',
        askedPerCategory: JSON.stringify({ grammar: 1, vocabulary: 0, reading: 0 }),
        totalAnswered: '0',
        ended: 'false',
        currentQuestionId: sampleSession.currentQuestionId,
        servedAt: sampleSession.servedAt,
      });
      prisma.userLevel.findUnique.mockResolvedValue({
        lastEvalSessionId: sampleSession.evalId,
        lastEvalLevel: null,
      });

      const result = await service.loadExamSession('u-1');

      expect(result).toEqual(
        expect.objectContaining({
          ended: true,
          level: null,
        }),
      );
    });

    it.each([
      ['malformed JSON', '{invalid'],
      ['schema-invalid JSON', JSON.stringify({ grammar: -1 })],
    ])('throws placement.invalidSession for %s', async (_description, askedPerCategory) => {
      redis.client.hGetAll.mockResolvedValue({
        evalId: sampleSession.evalId,
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: '0',
        askedPerCategory,
        totalAnswered: '0',
        ended: 'false',
        currentQuestionId: sampleSession.currentQuestionId,
        servedAt: sampleSession.servedAt,
      });

      await expect(service.loadExamSession('u-1')).rejects.toThrow(
        new ConflictException('placement.invalidSession'),
      );
    });
  });

  describe('answer persistence', () => {
    const answers: SubmitAnswerInput[] = [
      { questionId: 'b7c1e4a2-5d38-4f6b-9a02-1e7c8d3f5b64', choice: 'ist' },
      { questionId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d', choice: null },
    ];

    it('replaces the Redis list with all session answers when saving', async () => {
      await service.saveExamSession('u-1', { ...sampleSession, answers });

      expect(multiMock.del).toHaveBeenCalledWith('user:u-1:eval_questions');
      expect(multiMock.rPush).toHaveBeenNthCalledWith(
        1,
        'user:u-1:eval_questions',
        JSON.stringify(answers[0]),
      );
      expect(multiMock.rPush).toHaveBeenNthCalledWith(
        2,
        'user:u-1:eval_questions',
        JSON.stringify(answers[1]),
      );
      expect(multiMock.expire).toHaveBeenCalledWith(
        'user:u-1:eval_questions',
        PLACEMENT_REDIS_KEY_TTL,
      );
    });

    it('loads validated answers from the existing Redis list', async () => {
      redis.client.hGetAll.mockResolvedValue({
        evalId: sampleSession.evalId,
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: '0',
        askedPerCategory: JSON.stringify(sampleSession.askedPerCategory),
        totalAnswered: '2',
        ended: 'false',
        currentQuestionId: sampleSession.currentQuestionId,
        servedAt: sampleSession.servedAt,
      });
      redis.client.lRange.mockResolvedValue(answers.map((answer) => JSON.stringify(answer)));

      await expect(service.loadExamSession('u-1')).resolves.toEqual({
        ...sampleSession,
        totalAnswered: 2,
        answers,
      });
    });

    it.each([
      ['malformed JSON', '{invalid'],
      ['schema-invalid JSON', JSON.stringify({ questionId: 'not-a-uuid', choice: 'ist' })],
    ])('throws placement.invalidSession for %s answer data', async (_description, rawAnswer) => {
      redis.client.hGetAll.mockResolvedValue({
        evalId: sampleSession.evalId,
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: '0',
        askedPerCategory: JSON.stringify(sampleSession.askedPerCategory),
        totalAnswered: '1',
        ended: 'false',
        currentQuestionId: sampleSession.currentQuestionId,
        servedAt: sampleSession.servedAt,
      });
      redis.client.lRange.mockResolvedValue([rawAnswer]);

      await expect(service.loadExamSession('u-1')).rejects.toThrow(
        new ConflictException('placement.invalidSession'),
      );
    });

    it('rejects duplicate question IDs in the Redis list', async () => {
      redis.client.hGetAll.mockResolvedValue({
        evalId: sampleSession.evalId,
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: '0',
        askedPerCategory: JSON.stringify(sampleSession.askedPerCategory),
        totalAnswered: '2',
        ended: 'false',
        currentQuestionId: sampleSession.currentQuestionId,
        servedAt: sampleSession.servedAt,
      });
      redis.client.lRange.mockResolvedValue([
        JSON.stringify(answers[0]),
        JSON.stringify(answers[0]),
      ]);

      await expect(service.loadExamSession('u-1')).rejects.toThrow(
        new ConflictException('placement.invalidSession'),
      );
    });
  });

  describe('deleteSession', () => {
    it('deletes session and questions keys from redis', async () => {
      await service.deleteSession('u-1');

      expect(redis.client.del).toHaveBeenCalledWith(['user:u-1:eval', 'user:u-1:eval_questions']);
    });
  });
});
