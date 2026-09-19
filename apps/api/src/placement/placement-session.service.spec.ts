import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExamSession, SubmitAnswerInput } from '@ft/shared';

import type { RedisService } from '../redis/redis.service';
import { PLACEMENT_REDIS_KEY_TTL, PlacementSessionService } from './placement-session.service';

function createSessionService(redisClientOverrides: Record<string, unknown> = {}) {
  const redis = {
    client: {
      exists: vi.fn().mockResolvedValue(0),
      hSet: vi.fn().mockResolvedValue(1),
      hGetAll: vi.fn().mockResolvedValue({}),
      hIncrBy: vi.fn().mockResolvedValue(1),
      del: vi.fn().mockResolvedValue(1),
      sAdd: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      ...redisClientOverrides,
    },
  };

  return {
    service: new PlacementSessionService(redis as unknown as RedisService),
    redis,
  };
}

describe('PlacementSessionService', () => {
  let service: PlacementSessionService;
  let redis: ReturnType<typeof createSessionService>['redis'];

  beforeEach(() => {
    const created = createSessionService();
    service = created.service;
    redis = created.redis;
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

  it('generates consistent eval and eval_questions keys', () => {
    expect(service.evalKey('u-1')).toBe('user:u-1:eval');
    expect(service.evalQuestionsKey('u-1')).toBe('user:u-1:eval_questions');
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
    it('stores session data into redis hash with TTL', async () => {
      await service.saveExamSession('u-1', sampleSession);

      expect(redis.client.hSet).toHaveBeenCalledWith('user:u-1:eval', {
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
      expect(redis.client.expire).toHaveBeenCalledWith('user:u-1:eval', PLACEMENT_REDIS_KEY_TTL);
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
  });

  describe('archiveQuestionAnswer', () => {
    it('adds serialized answer to redis set and sets TTL', async () => {
      const answer: SubmitAnswerInput = {
        questionId: 'b7c1e4a2-5d38-4f6b-9a02-1e7c8d3f5b64',
        choice: 'ist',
      };

      await service.archiveQuestionAnswer('u-1', answer);

      expect(redis.client.sAdd).toHaveBeenCalledWith(
        'user:u-1:eval_questions',
        JSON.stringify(answer),
      );
      expect(redis.client.expire).toHaveBeenCalledWith(
        'user:u-1:eval_questions',
        PLACEMENT_REDIS_KEY_TTL,
      );
      expect(redis.client.hIncrBy).toHaveBeenCalledWith('user:u-1:eval', 'totalAnswered', 1);
    });
  });

  describe('deleteSession', () => {
    it('deletes session and questions keys from redis', async () => {
      await service.deleteSession('u-1');

      expect(redis.client.del).toHaveBeenCalledWith(['user:u-1:eval', 'user:u-1:eval_questions']);
    });
  });
});
