import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { LanguageSchema, QuestionCategorySchema } from '@ft/shared';

import { RedisService } from '../redis/redis.service';

/** Long enough to finish an exam, short enough that an abandoned one cleans itself up. */
const RUN_TTL_S = 60 * 60;

/**
 * Outlives a slow request, so two can never both write. The lock is released
 * in finally, so this only matters if the process dies holding it.
 */
const LOCK_TTL_S = 30;

/** Deletes the lock only if it is still ours: an expired one may belong to the next request. */
const RELEASE_LOCK = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  end
  return 0
`;

/** The question on screen. The options are stored shuffled, so a reload keeps their order. */
const CurrentSchema = z.object({
  questionId: z.uuid(),
  servedAt: z.int(),
  options: z.array(z.string()),
});

/** One run, as stored. Null current means the search is over and only the result is left. */
const RunSchema = z.object({
  lang: LanguageSchema,
  search: z.object({
    lo: z.int(),
    hi: z.int(),
    asked: z.record(QuestionCategorySchema, z.int().min(0)),
    mistakes: z.int().min(0),
  }),
  current: CurrentSchema.nullable(),
  answers: z.array(z.object({ questionId: z.uuid(), choice: z.string().nullable() })),
});

export type Current = z.infer<typeof CurrentSchema>;
export type Run = z.infer<typeof RunSchema>;

/**
 * By user rather than by session: a session lives for days, a run for an hour,
 * and a second login must not be able to start a second run.
 */
const runKey = (userId: string) => `placement:${userId}`;
const lockKey = (userId: string) => `placement:${userId}:lock`;

function parse(raw: string): Run | null {
  try {
    return RunSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** The exam in progress lives here and nowhere else, until it writes its verdict. */
@Injectable()
export class PlacementStore {
  constructor(private readonly redis: RedisService) {}

  async load(userId: string): Promise<Run | null> {
    const raw = await this.redis.client.get(runKey(userId));
    if (raw === null) {
      return null;
    }
    const run = parse(raw);
    if (run === null) {
      // An older shape or a corrupt value: not worth a 500, the learner starts again.
      await this.remove(userId);
    }
    return run;
  }

  /** SET re-arms the TTL on every write, so a run in progress never expires. */
  async save(userId: string, run: Run): Promise<void> {
    await this.redis.client.set(runKey(userId), JSON.stringify(run), { EX: RUN_TTL_S });
  }

  async remove(userId: string): Promise<void> {
    await this.redis.client.del(runKey(userId));
  }

  /**
   * One request at a time per learner. A double click or a second tab gets a
   * 409 instead of two answers loading the same run and overwriting each other.
   */
  async withLock<T>(userId: string, work: () => Promise<T>): Promise<T> {
    const key = lockKey(userId);
    const token = randomUUID();
    if ((await this.redis.client.set(key, token, { NX: true, EX: LOCK_TTL_S })) === null) {
      throw new ConflictException('placement.inProgress');
    }
    try {
      return await work();
    } finally {
      await this.redis.client.eval(RELEASE_LOCK, { keys: [key], arguments: [token] });
    }
  }
}
