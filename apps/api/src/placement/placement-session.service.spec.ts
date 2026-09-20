import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExamSession, SubmitAnswerInput } from '@ft/shared';

import type { RedisService } from '../redis/redis.service';
import { PLACEMENT_REDIS_KEY_TTL, PlacementSessionService } from './placement-session.service';

function createSessionService(redisClientOverrides: Record<string, unknown> = {}) {
  const multiMock = {
    hSet: vi.fn().mockReturnThis(),
    rPush: vi.fn().mockReturnThis(),
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
      multi: vi.fn(() => multiMock),
      ...redisClientOverrides,
    },
  };

  return {
    service: new PlacementSessionService(redis as unknown as RedisService),
    redis,
    multiMock,
  };
}

describe('PlacementSessionService', () => {
  let service: PlacementSessionService;
  let redis: ReturnType<typeof createSessionService>['redis'];
  let multiMock: ReturnType<typeof createSessionService>['multiMock'];

  beforeEach(() => {
    const created = createSessionService();
    service = created.service;
    redis = created.redis;
    multiMock = created.multiMock;
  });

  const sampleSession: ExamSession = {
    lang: 'de',
    lo: 'A1',
    hi: 'C2',
    level: 'B1',
    mistakesPerLevel: 0,
    askedPerCategory: { grammar: 1, vocabulary: 0, reading: 0 },
    totalAnswered: 0,
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
    it('returns true when lock is successfully acquired', async () => {
      redis.client.set.mockResolvedValue('OK');
      const result = await service.acquireLock('u-1');
      expect(result).toBe(true);
      expect(redis.client.set).toHaveBeenCalledWith('user:u-1:eval_lock', 'locked', {
        NX: true,
        EX: 5,
      });
    });

    it('returns false when lock already exists', async () => {
      redis.client.set.mockResolvedValue(null);
      const result = await service.acquireLock('u-1');
      expect(result).toBe(false);
    });
  });

  describe('releaseLock', () => {
    it('deletes the lock key from redis', async () => {
      await service.releaseLock('u-1');
      expect(redis.client.del).toHaveBeenCalledWith(['user:u-1:eval_lock']);
    });
  });

  describe('acquireLockWithRetry', () => {
    it('returns true immediately if lock is acquired on first attempt', async () => {
      redis.client.set.mockResolvedValue('OK');
      const result = await service.acquireLockWithRetry('u-1', 2, 1);
      expect(result).toBe(true);
      expect(redis.client.set).toHaveBeenCalledTimes(1);
    });

    it('returns true after retrying if lock is initially held', async () => {
      redis.client.set.mockResolvedValueOnce(null).mockResolvedValueOnce('OK');
      const result = await service.acquireLockWithRetry('u-1', 2, 1);
      expect(result).toBe(true);
      expect(redis.client.set).toHaveBeenCalledTimes(2);
    });

    it('returns false if lock cannot be acquired after max retries', async () => {
      redis.client.set.mockResolvedValue(null);
      const result = await service.acquireLockWithRetry('u-1', 2, 1);
      expect(result).toBe(false);
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
      expect(multiMock.exec).toHaveBeenCalled();
    });
  });

  describe('loadExamSession', () => {
    it('returns null when no data in redis', async () => {
      redis.client.hGetAll.mockResolvedValue({});
      const result = await service.loadExamSession('u-1');
      expect(result).toBeNull();
    });

    it('parses and returns valid ExamSession', async () => {
      redis.client.hGetAll.mockResolvedValue({
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
    });

    it.each([
      ['malformed JSON', '{invalid'],
      ['schema-invalid JSON', JSON.stringify({ grammar: -1 })],
    ])('throws placement.invalidSession for %s', async (_description, askedPerCategory) => {
      redis.client.hGetAll.mockResolvedValue({
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

  describe('archiveQuestionAnswer', () => {
    it('adds serialized answer to redis list and sets TTL within a multi transaction', async () => {
      const answer: SubmitAnswerInput = {
        questionId: 'b7c1e4a2-5d38-4f6b-9a02-1e7c8d3f5b64',
        choice: 'ist',
      };

      await service.archiveQuestionAnswer('u-1', answer);

      expect(redis.client.multi).toHaveBeenCalled();
      expect(multiMock.rPush).toHaveBeenCalledWith(
        'user:u-1:eval_questions',
        JSON.stringify(answer),
      );
      expect(multiMock.expire).toHaveBeenCalledWith(
        'user:u-1:eval_questions',
        PLACEMENT_REDIS_KEY_TTL,
      );
      expect(multiMock.exec).toHaveBeenCalled();
    });
  });

  describe('getQuestionAnswers', () => {
    it('returns empty array when redis list is empty', async () => {
      redis.client.lRange.mockResolvedValue([]);
      const result = await service.getQuestionAnswers('u-1');
      expect(result).toEqual([]);
      expect(redis.client.lRange).toHaveBeenCalledWith('user:u-1:eval_questions', 0, -1);
    });

    it('returns parsed SubmitAnswerInput array from redis list', async () => {
      const answers: SubmitAnswerInput[] = [
        { questionId: 'b7c1e4a2-5d38-4f6b-9a02-1e7c8d3f5b64', choice: 'ist' },
        { questionId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d', choice: null },
      ];
      redis.client.lRange.mockResolvedValue(answers.map((a) => JSON.stringify(a)));

      const result = await service.getQuestionAnswers('u-1');
      expect(result).toEqual(answers);
    });

    it.each([
      ['malformed JSON', '{invalid'],
      ['schema-invalid JSON', JSON.stringify({ questionId: 'not-a-uuid', choice: 'ist' })],
    ])('throws placement.invalidSession for %s', async (_description, rawAnswer) => {
      redis.client.lRange.mockResolvedValue([rawAnswer]);

      await expect(service.getQuestionAnswers('u-1')).rejects.toThrow(
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
