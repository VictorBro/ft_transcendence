import { ConflictException, Injectable } from '@nestjs/common';
import { ExamSession, ExamSessionSchema, SubmitAnswerInput, SubmitAnswerSchema } from '@ft/shared';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export const PLACEMENT_REDIS_KEY_TTL = 3600;
export const PLACEMENT_LOCK_TTL_SECONDS = 5;

@Injectable()
export class PlacementSessionService {
  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Generates the Redis hash key used to store the user's placement exam session.
   *
   * @param userId - Unique identifier of the user.
   * @returns Redis key string for the exam session.
   */
  evalKey(userId: string): string {
    return `user:${userId}:eval`;
  }

  /**
   * Generates the Redis list key used to archive submitted question answers.
   *
   * @param userId - Unique identifier of the user.
   * @returns Redis key string for the answered questions list.
   */
  evalQuestionsKey(userId: string): string {
    return `user:${userId}:eval_questions`;
  }

  /**
   * Generates the Redis key used for mutual exclusion during placement initialization.
   *
   * @param userId - Unique identifier of the user.
   * @returns Redis lock key string.
   */
  evalLockKey(userId: string): string {
    return `user:${userId}:eval_lock`;
  }

  /**
   * Atomically acquires a mutual exclusion lock for placement initialization.
   * Uses Redis `SET ... NX EX` to prevent concurrent `startPlacement` calls from racing.
   *
   * @param userId - Unique identifier of the user.
   * @param ttlSeconds - Time-to-live for the lock in seconds (defaults to `PLACEMENT_LOCK_TTL_SECONDS`).
   * @returns `true` if lock was successfully acquired; `false` if already locked.
   */
  async acquireLock(userId: string, ttlSeconds = PLACEMENT_LOCK_TTL_SECONDS): Promise<boolean> {
    const result = await this.redis.client.set(this.evalLockKey(userId), 'locked', {
      NX: true,
      EX: ttlSeconds,
    });
    return result !== null;
  }

  /**
   * Releases the mutual exclusion lock for placement initialization.
   *
   * @param userId - Unique identifier of the user.
   * @returns Promise resolving when the lock key is removed.
   */
  async releaseLock(userId: string): Promise<void> {
    await this.redis.client.del([this.evalLockKey(userId)]);
  }

  /**
   * Attempts to acquire the lock, retrying with a short backoff if currently held.
   * Useful for concurrent operations like answer submissions to absorb rapid double-clicks.
   *
   * @param userId - Unique identifier of the user.
   * @param maxRetries - Maximum retry attempts (defaults to 10).
   * @param delayMs - Delay in milliseconds between retries (defaults to 50).
   * @param ttlSeconds - Time-to-live for the lock in seconds (defaults to `PLACEMENT_LOCK_TTL_SECONDS`).
   * @returns `true` if lock was successfully acquired; `false` if timed out.
   */
  async acquireLockWithRetry(
    userId: string,
    maxRetries = 10,
    delayMs = 50,
    ttlSeconds = PLACEMENT_LOCK_TTL_SECONDS,
  ): Promise<boolean> {
    for (let i = 0; i <= maxRetries; i++) {
      const acquired = await this.acquireLock(userId, ttlSeconds);
      if (acquired) return true;
      if (i < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return false;
  }

  /**
   * Checks whether an active placement session exists in Redis for the user.
   * Only checks key existence; there can be at most one placement session per user.
   *
   * @param userId - Unique identifier of the user.
   * @returns `true` if an active session key exists; otherwise `false`.
   */
  async hasActiveSession(userId: string): Promise<boolean> {
    const existing = await this.redis.client.exists(this.evalKey(userId));
    return Boolean(existing);
  }

  /**
   * Serializes and persists the exam session fields into a Redis hash and resets its TTL.
   *
   * @param userId - Unique identifier of the user.
   * @param session - Exam session state to persist.
   * @returns Promise resolving when the session is saved in Redis.
   */
  async saveExamSession(userId: string, session: ExamSession): Promise<void> {
    const key = this.evalKey(userId);
    await this.redis.client
      .multi()
      .hSet(key, {
        evalId: session.evalId,
        lang: session.lang,
        lo: session.lo,
        hi: session.hi,
        level: session.level,
        mistakesPerLevel: session.mistakesPerLevel.toString(),
        askedPerCategory: JSON.stringify(session.askedPerCategory),
        totalAnswered: session.totalAnswered.toString(),
        ended: session.ended.toString(),
        currentQuestionId: session.currentQuestionId ?? '',
        servedAt: session.servedAt,
      })
      .expire(key, PLACEMENT_REDIS_KEY_TTL)
      .exec();
  }

  /**
   * Loads and deserializes the exam session from Redis, validates the schema, and reconciles
   * completion against the durable evaluation marker in the database.
   *
   * @param userId - Unique identifier of the user.
   * @returns The parsed `ExamSession`, or `null` if no active session exists.
   */
  async loadExamSession(userId: string): Promise<ExamSession | null> {
    const key = this.evalKey(userId);
    const data = await this.redis.client.hGetAll(key);
    if (!data || Object.keys(data).length === 0) {
      return null;
    }
    let session: ExamSession;
    try {
      session = ExamSessionSchema.parse({
        evalId: data.evalId,
        lang: data.lang,
        lo: data.lo,
        hi: data.hi,
        level: data.level,
        mistakesPerLevel: Number(data.mistakesPerLevel),
        askedPerCategory: JSON.parse(data.askedPerCategory || '{}'),
        totalAnswered: Number(data.totalAnswered ?? 0),
        ended: data.ended === 'true',
        currentQuestionId: data.currentQuestionId ? data.currentQuestionId : null,
        servedAt: data.servedAt,
      });
    } catch {
      throw new ConflictException('placement.invalidSession');
    }

    const userLevel = await this.prisma.userLevel.findUnique({
      where: {
        userId_lang: {
          userId,
          lang: session.lang,
        },
      },
      select: {
        lastEvalSessionId: true,
        lastEvalLevel: true,
      },
    });

    if (userLevel?.lastEvalSessionId === session.evalId) {
      session.ended = true;
      session.level = userLevel.lastEvalLevel;
    }

    return session;
  }

  /**
   * Appends a submitted answer to the user's answers list in Redis and refreshes the key TTL.
   *
   * @param userId - Unique identifier of the user.
   * @param answer - Answer input payload containing question ID and choice.
   * @returns Promise resolving when the answer is appended.
   */
  async archiveQuestionAnswer(userId: string, answer: SubmitAnswerInput): Promise<void> {
    const questionsListKey = this.evalQuestionsKey(userId);
    await this.redis.client
      .multi()
      .rPush(questionsListKey, JSON.stringify(answer))
      .expire(questionsListKey, PLACEMENT_REDIS_KEY_TTL)
      .exec();
  }

  /**
   * Retrieves and parses all archived answers submitted by the user during the current session.
   *
   * @param userId - Unique identifier of the user.
   * @returns Array of validated submitted answers in chronological order.
   */
  async getQuestionAnswers(userId: string): Promise<SubmitAnswerInput[]> {
    const questionsListKey = this.evalQuestionsKey(userId);
    const rawAnswers = await this.redis.client.lRange(questionsListKey, 0, -1);
    try {
      return rawAnswers.map((raw) => SubmitAnswerSchema.parse(JSON.parse(raw)));
    } catch {
      throw new ConflictException('placement.invalidSession');
    }
  }

  /**
   * Deletes both the exam session hash and the question answers list keys from Redis.
   *
   * @param userId - Unique identifier of the user.
   * @returns Promise resolving when the Redis keys are removed.
   */
  async deleteSession(userId: string): Promise<void> {
    await this.redis.client.del([this.evalKey(userId), this.evalQuestionsKey(userId)]);
  }
}
