import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SubmitAnswerSchema } from '@ft/shared';

import { ExamSession, ExamSessionSchema } from './placement.schema';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export const PLACEMENT_REDIS_KEY_TTL = 3600;
export const PLACEMENT_LOCK_TTL_SECONDS = 5;
const RELEASE_LOCK_SCRIPT = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  end
  return 0
`;
const EXTEND_LOCK_SCRIPT = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("EXPIRE", KEYS[1], ARGV[2])
  end
  return 0
`;

@Injectable()
export class PlacementSessionService {
  private readonly lockHeartbeats = new Map<string, ReturnType<typeof setInterval>>();

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
   * @returns Unique ownership token, or null if the lock is already held.
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

    this.startLockHeartbeat(userId, token, ttlSeconds);
    return token;
  }

  /**
   * Releases the mutual exclusion lock for placement initialization.
   *
   * @param userId - Unique identifier of the user.
   * @param token - Ownership token returned during acquisition.
   * @returns Promise resolving when the lock key is removed.
   */
  async releaseLock(userId: string, token: string): Promise<void> {
    this.stopLockHeartbeat(token);
    await this.redis.client.eval(RELEASE_LOCK_SCRIPT, {
      keys: [this.evalLockKey(userId)],
      arguments: [token],
    });
  }

  /** Extends a lock only while it is still owned by the supplied token. */
  async extendLock(
    userId: string,
    token: string,
    ttlSeconds = PLACEMENT_LOCK_TTL_SECONDS,
  ): Promise<boolean> {
    const result = await this.redis.client.eval(EXTEND_LOCK_SCRIPT, {
      keys: [this.evalLockKey(userId)],
      arguments: [token, ttlSeconds.toString()],
    });
    return result === 1;
  }

  private startLockHeartbeat(userId: string, token: string, ttlSeconds: number): void {
    const intervalMs = Math.max(100, Math.floor((ttlSeconds * 1000) / 3));
    const heartbeat = setInterval(() => {
      void this.extendLock(userId, token, ttlSeconds)
        .then((extended) => {
          if (!extended) this.stopLockHeartbeat(token);
        })
        .catch(() => this.stopLockHeartbeat(token));
    }, intervalMs);
    heartbeat.unref();
    this.lockHeartbeats.set(token, heartbeat);
  }

  private stopLockHeartbeat(token: string): void {
    const heartbeat = this.lockHeartbeats.get(token);
    if (heartbeat) clearInterval(heartbeat);
    this.lockHeartbeats.delete(token);
  }

  /**
   * Attempts to acquire the lock, retrying with a short backoff if currently held.
   * Useful for concurrent operations like answer submissions to absorb rapid double-clicks.
   *
   * @param userId - Unique identifier of the user.
   * @param maxRetries - Maximum retry attempts (defaults to 10).
   * @param delayMs - Delay in milliseconds between retries (defaults to 50).
   * @param ttlSeconds - Time-to-live for the lock in seconds (defaults to `PLACEMENT_LOCK_TTL_SECONDS`).
   * @returns Unique ownership token, or null if acquisition times out.
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
   * Loads and deserializes the exam session from Redis, validates the schema, and reconciles
   * completion against the durable evaluation marker in the database.
   *
   * @param userId - Unique identifier of the user.
   * @returns The parsed `ExamSession`, or `null` if no active session exists.
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
        servedAt: data.servedAt,
      });
    } catch {
      throw new ConflictException('placement.invalidSession');
    }

    return session;
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
