import type { ErrorCode } from '@ft/shared';
import type { RedisClientType } from 'redis';

import { discussionLimited } from '../metrics/metrics';

/**
 * How many lesson discussion messages the API lets through (#150).
 * Per learner: a minute and a day. For everyone together: a minute, so the
 * shared LLM key stays under its own quota.
 */
export interface DiscussionLimits {
  userPerMinute: number;
  userPerDay: number;
  globalPerMinute: number;
}

const DEFAULTS: DiscussionLimits = { userPerMinute: 6, userPerDay: 60, globalPerMinute: 5 };

const ENV_NAMES: Record<keyof DiscussionLimits, string> = {
  userPerMinute: 'LLM_DISCUSSION_USER_PER_MINUTE',
  userPerDay: 'LLM_DISCUSSION_USER_PER_DAY',
  globalPerMinute: 'LLM_DISCUSSION_GLOBAL_PER_MINUTE',
};

/**
 * The limits from the .env file, a default for each one missing or empty.
 * Throws on anything but a whole number, so a typo stops the start instead of
 * turning a limit off (a count is never greater than NaN).
 */
export function readDiscussionLimits(env: Record<string, string | undefined>): DiscussionLimits {
  const limits = { ...DEFAULTS };
  for (const field of Object.keys(ENV_NAMES) as (keyof DiscussionLimits)[]) {
    const raw = env[ENV_NAMES[field]];
    if (raw === undefined || raw.trim() === '') continue;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(
        `${ENV_NAMES[field]} must be a whole number, got "${raw}". See .env.example.`,
      );
    }
    limits[field] = value;
  }
  return limits;
}

/** A refusal: the code for the learner, and the seconds until the window resets. */
export interface Refusal {
  code: ErrorCode;
  retryAfter: number;
}

/**
 * Counts one message against each window, in order, and stops at the first
 * one over its limit. A window is a Redis counter that lives `seconds`: the
 * first message creates it and starts the clock, the key then disappears and
 * the count starts over (a fixed window, not a sliding one).
 *
 * The learner's own limits say "you", the global one says "the tutor is busy":
 * waiting is the same, who caused it is not.
 */
export async function countMessage(
  client: RedisClientType,
  userId: string,
  limits: DiscussionLimits,
): Promise<Refusal | null> {
  const windows = [
    {
      name: 'user_minute',
      key: `discussion:user:${userId}:minute`,
      limit: limits.userPerMinute,
      seconds: 60,
      code: 'llm.tooManyMessages',
    },
    {
      name: 'user_day',
      key: `discussion:user:${userId}:day`,
      limit: limits.userPerDay,
      seconds: 24 * 60 * 60,
      code: 'llm.tooManyMessages',
    },
    {
      name: 'global_minute',
      key: 'discussion:global:minute',
      limit: limits.globalPerMinute,
      seconds: 60,
      code: 'llm.rateLimited',
    },
  ] as const;

  for (const window of windows) {
    // One transaction, so a crash between INCR and EXPIRE cannot leave a
    // counter that never expires. NX: only the first message sets the clock.
    const [count, , ttl] = await client
      .multi()
      .incr(window.key)
      .expire(window.key, window.seconds, 'NX')
      .ttl(window.key)
      .execTyped();
    if (count > window.limit) {
      discussionLimited.inc({ limit: window.name });
      return { code: window.code, retryAfter: Math.max(ttl, 1) };
    }
  }
  return null;
}
