import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SubmitAnswerSchema } from '@ft/shared';

import { ExamSession, ExamSessionSchema } from './placement.schema';
import { RedisService } from '../redis/redis.service';

export const PLACEMENT_REDIS_KEY_TTL = 3600;
export const PLACEMENT_LOCK_TTL_SECONDS = 5;

@Injectable()
export class PlacementSessionService {
  constructor(private readonly redis: RedisService) {}

  /**
   * Generates the Redis hash key used to store the user's placement exam session.
   */
  evalKey(userId: string): string {
    return `user:${userId}:eval`;
  }

  /**
   * Generates the Redis list key used to archive submitted question answers.
   */
  evalQuestionsKey(userId: string): string {
    return `user:${userId}:eval_questions`;
  }

  /**
   * Generates the Redis key used for mutual exclusion during placement initialization.
   */
  evalLockKey(userId: string): string {
    return `user:${userId}:eval_lock`;
  }

  /**
   * Atomically acquires a mutual exclusion lock for placement initialization.
   * Uses Redis `SET ... NX EX` to prevent concurrent `startPlacement` calls from racing.
   */
  async acquireLock(
    userId: string,
    ttlSeconds = PLACEMENT_LOCK_TTL_SECONDS,
  ): Promise<string | null> {
    const token = randomUUID();
    const result = await this.redis.client.set(this.evalLockKey(userId), token, {
      NX: true,
      EX: ttlSeconds,
    });
    if (result === null) return null;

    return token;
  }

  /**
   * Attempts to acquire the lock, retrying with a short backoff if currently held.
   * Useful for concurrent operations like answer submissions to absorb rapid double-clicks.
   */
  async acquireLockWithRetry(
    userId: string,
    maxRetries = 10,
    delayMs = 50,
    ttlSeconds = PLACEMENT_LOCK_TTL_SECONDS,
  ): Promise<string | null> {
    for (let i = 0; i <= maxRetries; i++) {
      const token = await this.acquireLock(userId, ttlSeconds);
      if (token) return token;
      if (i < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return null;
  }

  /**
   * Releases the mutual exclusion lock only if the caller still owns it.
   * Uses a Lua script for atomic compare-and-delete so an expired lock
   * that has been re-acquired by another caller is never accidentally removed.
   */
  async releaseLock(userId: string, token: string): Promise<void> {
    const script = `if redis.call("get",KEYS[1]) == ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`;
    await this.redis.client.eval(script, {
      keys: [this.evalLockKey(userId)],
      arguments: [token],
    });
  }

  /**
   * Whether the user's run is still being answered. A finished run only holds
   * its report, and one missing the field cannot be resumed, so neither counts.
   */
  async hasLiveSession(userId: string): Promise<boolean> {
    return (await this.redis.client.hGet(this.evalKey(userId), 'ended')) === 'false';
  }

  /**
   * Serializes and persists the exam session fields into a Redis hash and resets its TTL.
   */
  async saveExamSession(userId: string, session: ExamSession): Promise<void> {
    const key = this.evalKey(userId);
    const questionsListKey = this.evalQuestionsKey(userId);
    const transaction = this.redis.client.multi().hSet(key, {
      evalId: session.evalId,
      lang: session.lang,
      lo: session.lo,
      hi: session.hi,
      level: session.level ?? '',
      mistakesPerLevel: session.mistakesPerLevel.toString(),
      askedPerCategory: JSON.stringify(session.askedPerCategory),
      totalAnswered: session.totalAnswered.toString(),
      ended: session.ended.toString(),
      currentQuestionId: session.currentQuestionId ?? '',
      currentOptions: session.currentOptions ? JSON.stringify(session.currentOptions) : '',
      servedAt: session.servedAt,
    });

    transaction.expire(key, PLACEMENT_REDIS_KEY_TTL).del(questionsListKey);
    for (const answer of session.answers) {
      transaction.rPush(questionsListKey, JSON.stringify(answer));
    }
    if (session.answers.length > 0) {
      transaction.expire(questionsListKey, PLACEMENT_REDIS_KEY_TTL);
    }
    await transaction.exec();
  }

  /**
   * Loads and deserializes the exam session from Redis and validates the schema.
   *
   * @throws ConflictException If the stored session data is invalid (`placement.invalidSession`).
   */
  async loadExamSession(userId: string): Promise<ExamSession | null> {
    const key = this.evalKey(userId);
    const replies = await this.redis.client
      .multi()
      .hGetAll(key)
      .lRange(this.evalQuestionsKey(userId), 0, -1)
      .exec();
    if (!replies || replies.length < 2 || !replies[0]) {
      return null;
    }
    const data = replies[0] as unknown as Record<string, string>;
    const rawAnswers = (replies[1] as unknown as string[]) ?? [];
    if (!data || Object.keys(data).length === 0) {
      return null;
    }
    let session: ExamSession;
    try {
      const answers = rawAnswers.map((raw) => SubmitAnswerSchema.parse(JSON.parse(raw)));
      if (new Set(answers.map((answer) => answer.questionId)).size !== answers.length) {
        throw new Error('Duplicate question ID');
      }
      session = ExamSessionSchema.parse({
        evalId: data.evalId,
        lang: data.lang,
        lo: Number(data.lo),
        hi: Number(data.hi),
        level:
          data.level !== undefined && data.level !== '' && !Number.isNaN(Number(data.level))
            ? Number(data.level)
            : null,
        mistakesPerLevel: Number(data.mistakesPerLevel),
        askedPerCategory: JSON.parse(data.askedPerCategory || '{}'),
        totalAnswered: Number(data.totalAnswered ?? 0),
        answers,
        ended: data.ended === 'true',
        currentQuestionId: data.currentQuestionId ? data.currentQuestionId : null,
        currentOptions: data.currentOptions ? JSON.parse(data.currentOptions) : null,
        servedAt: data.servedAt,
      });
    } catch {
      await this.deleteSession(userId);
      throw new ConflictException('placement.invalidSession');
    }

    return session;
  }

  /**
   * Deletes both the exam session hash and the question answers list keys from Redis.
   */
  async deleteSession(userId: string): Promise<void> {
    await this.redis.client.del([this.evalKey(userId), this.evalQuestionsKey(userId)]);
  }
}
