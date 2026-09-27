import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { examSession, fakeRedis } from '../../test/placement.fixtures';
import type { RedisService } from '../redis/redis.service';
import { PlacementSessionService } from './placement-session.service';

const RUN = 'user:u-1:eval';
const ANSWERS = 'user:u-1:eval_questions';
const LOCK = 'user:u-1:eval_lock';

describe('PlacementSessionService', () => {
  let redis: ReturnType<typeof fakeRedis>;
  let service: PlacementSessionService;

  beforeEach(() => {
    redis = fakeRedis();
    service = new PlacementSessionService(redis as unknown as RedisService);
  });

  describe('the lock', () => {
    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    // Short, so a crashed holder does not lock the learner out for long.
    it('goes to one caller at a time, for five seconds', async () => {
      await expect(service.acquireLock('u-1')).resolves.toEqual(expect.any(String));
      expect(redis.ttl.get(LOCK)).toBe(5);

      await expect(service.acquireLock('u-1')).resolves.toBeNull();
    });

    it('is released only by the token that holds it, not by one whose lock expired', async () => {
      const stale = await service.acquireLock('u-1');
      redis.data.delete(LOCK);
      const token = await service.acquireLock('u-1');

      await service.releaseLock('u-1', stale!);
      expect(redis.data.get(LOCK)).toBe(token);

      await service.releaseLock('u-1', token!);
      expect(redis.data.has(LOCK)).toBe(false);
    });

    // A double click: the first request frees the lock a moment later.
    it('is waited for while another caller holds it', async () => {
      vi.useFakeTimers();
      await redis.client.set(LOCK, 'other');
      setTimeout(() => redis.data.delete(LOCK), 100);

      const waiting = service.acquireLockWithRetry('u-1');
      await vi.runAllTimersAsync();

      await expect(waiting).resolves.toEqual(expect.any(String));
    });

    it('is given up after the first try and maxRetries retries', async () => {
      await redis.client.set(LOCK, 'other');
      const set = vi.spyOn(redis.client, 'set');

      await expect(service.acquireLockWithRetry('u-1', 2, 1)).resolves.toBeNull();
      expect(set).toHaveBeenCalledTimes(3);
    });
  });

  describe('the stored run', () => {
    const answers = [
      { questionId: randomUUID(), choice: 'ist' },
      { questionId: randomUUID(), choice: null },
    ];

    // A1 is level 0, which a falsy check would turn into null, and 'fr' is not the default.
    it.each([
      ['with no question served yet', examSession()],
      [
        'mid-run at A1',
        examSession({
          lang: 'fr',
          lo: 0,
          hi: 1,
          level: 0,
          mistakesPerLevel: 1,
          askedPerCategory: { grammar: 1, vocabulary: 1, reading: 0 },
          totalAnswered: 2,
          answers,
          currentQuestionId: randomUUID(),
          currentOptions: ['hat', 'ist', 'wird', 'war'],
        }),
      ],
    ])('reads back %s exactly as saved', async (_, session) => {
      await service.saveExamSession('u-1', session);

      await expect(service.loadExamSession('u-1')).resolves.toEqual(session);
    });

    it('drops leftover answers and expires both keys after an hour', async () => {
      await redis.client.rPush(ANSWERS, 'left over from an expired run');

      await service.saveExamSession('u-1', examSession({ answers, totalAnswered: 2 }));

      expect(redis.data.get(ANSWERS)).toEqual(answers.map((answer) => JSON.stringify(answer)));
      expect(redis.ttl.get(RUN)).toBe(3600);
      expect(redis.ttl.get(ANSWERS)).toBe(3600);
    });

    it('is active from the first save until it is deleted', async () => {
      await expect(service.hasActiveSession('u-1')).resolves.toBe(false);

      await service.saveExamSession('u-1', examSession({ answers, totalAnswered: 2 }));
      await expect(service.hasActiveSession('u-1')).resolves.toBe(true);

      await service.deleteSession('u-1');
      await expect(service.hasActiveSession('u-1')).resolves.toBe(false);
      await expect(service.loadExamSession('u-1')).resolves.toBeNull();
      expect(redis.data.has(ANSWERS)).toBe(false);
    });

    // A run saved before the field existed must keep loading, not turn into a 409.
    it('saved before currentOptions existed loads with currentOptions null', async () => {
      const session = examSession({
        currentQuestionId: randomUUID(),
        currentOptions: ['a', 'b', 'c', 'd'],
      });
      await service.saveExamSession('u-1', session);
      delete (redis.data.get(RUN) as Record<string, string>).currentOptions;

      await expect(service.loadExamSession('u-1')).resolves.toEqual({
        ...session,
        currentOptions: null,
      });
    });

    it.each([
      ['a malformed askedPerCategory', { askedPerCategory: '{invalid' }, []],
      [
        'a negative category count',
        { askedPerCategory: '{"grammar":-1,"vocabulary":0,"reading":0}' },
        [],
      ],
      ['a third mistake', { mistakesPerLevel: '3' }, []],
      ['a negative mistake count', { mistakesPerLevel: '-1' }, []],
      ['an evalId that is not a uuid', { evalId: 'not-a-uuid' }, []],
      ['an unknown language', { lang: 'xx' }, []],
      ['a servedAt that is not an ISO time', { servedAt: 'yesterday' }, []],
      ['malformed served options', { currentOptions: '[invalid' }, []],
      ['three served options', { currentOptions: '["hat","ist","wird"]' }, []],
      ['a malformed answer', {}, ['{invalid']],
      ['an answer without a uuid', {}, ['{"questionId":"not-a-uuid","choice":"ist"}']],
      ['one question answered twice', {}, [JSON.stringify(answers[0]), JSON.stringify(answers[0])]],
    ])('is rejected as placement.invalidSession and dropped with %s', async (_, fields, stored) => {
      await service.saveExamSession('u-1', examSession());
      await redis.client.hSet(RUN, fields);
      for (const raw of stored) await redis.client.rPush(ANSWERS, raw);

      await expect(service.loadExamSession('u-1')).rejects.toThrow(
        new ConflictException('placement.invalidSession'),
      );
      // Dropped, so the next start is not refused for a run nobody can read.
      expect(redis.data.has(RUN)).toBe(false);
    });
  });
});
