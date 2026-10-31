/**
 * What lessons:author needs from a model (#83): one conversation per
 * lesson, where each prompt sees the replies before it, so the model fixes
 * its own lesson rather than starting over. Claude Code (claude.ts) is the
 * only provider; another model plugs in by implementing Provider.
 *
 *   provider.startChat('grammar') ─→ chat.send(lesson prompt) ─→ reply
 *                                    chat.send(the issues)     ─→ reply …
 */
import type { LessonKind } from '@ft/shared';

/** What a reply used, added up per lesson in the run report. */
export interface Usage {
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  /** In USD, the API price of the call: not billed on a subscription, a measure of the quota used. */
  costUsd: number;
}

export interface Reply extends Usage {
  text: string;
}

export interface Chat {
  send(prompt: string): Promise<Reply>;
}

export interface Provider {
  name: string;
  model: string;
  /** One line for the run's header: the binary it runs. */
  where: string;
  startChat(kind: LessonKind): Chat;
}

/**
 * A refusal that the next lesson would hit too (the subscription's usage
 * limit): the run stops instead of failing every remaining lesson.
 */
export class QuotaError extends Error {}

/** A short refusal (HTTP 429, "rate limit"): the same call is retried after a pause. */
export class RateLimitError extends Error {}

/**
 * The words of a refusal that lasts: the subscription's usage limit.
 * Narrow on purpose: a crash that only says "limit" somewhere (a memory
 * limit, a line limit) fails one lesson, not the run.
 */
export const QUOTA_MESSAGE = /usage limit|limit reached|quota/i;

/** The words of a short refusal, which a pause fixes. */
export const RATE_LIMIT_MESSAGE = /rate limit|too many requests/i;

/**
 * The error for a refusal: QuotaError when it lasts, RateLimitError for a
 * 429 or a rate limit message, undefined for any other failure.
 */
export function refusal(status: number | undefined, message: string): Error | undefined {
  if (QUOTA_MESSAGE.test(message)) return new QuotaError(message);
  if (status === 429 || RATE_LIMIT_MESSAGE.test(message)) return new RateLimitError(message);
  return undefined;
}

/** The pauses before each retry: 30 s, 1 min, 2 min, then the run stops. */
export const RETRY_DELAYS_MS = [30_000, 60_000, 120_000];

/**
 * Runs `call`, and again after each pause in `delaysMs` while it is
 * rate limited. Still rate limited after the last pause: the limit is not
 * a short one, so it becomes a QuotaError and the run stops.
 */
export async function retryRateLimits<T>(
  call: () => Promise<T>,
  delaysMs: number[] = RETRY_DELAYS_MS,
): Promise<T> {
  for (const delay of delaysMs) {
    try {
      return await call();
    } catch (e) {
      if (!(e instanceof RateLimitError)) throw e;
      console.warn(
        `  rate limited, retrying in ${Math.round(delay / 1000)} s: ${e.message.slice(0, 120)}`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  try {
    return await call();
  } catch (e) {
    throw e instanceof RateLimitError ? new QuotaError(e.message) : e;
  }
}
