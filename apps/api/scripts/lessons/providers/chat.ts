/**
 * What lessons:author needs from a model (#83), whichever runs it: one
 * conversation per lesson, where each prompt sees the replies before it,
 * so the model fixes its own lesson rather than starting over.
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
  /** In USD: billed for DeepSeek; for Claude Code, the API price of the quota used. */
  costUsd: number;
}

export interface Reply extends Usage {
  text: string;
}

export interface Chat {
  send(prompt: string): Promise<Reply>;
}

export interface Provider {
  name: 'claude' | 'deepseek';
  model: string;
  /** True when each reply costs money (DeepSeek), false on a subscription (Claude Code). */
  billed: boolean;
  /** One line for the run's header: the binary or the endpoint. */
  where: string;
  startChat(kind: LessonKind): Chat;
}

/**
 * A refusal that the next lesson would hit too (the usage limit, an empty
 * balance): the run stops instead of failing every remaining lesson.
 */
export class QuotaError extends Error {}

/**
 * The words of a usage refusal. Narrow on purpose: a crash that only says
 * "limit" somewhere (a memory limit, a line limit) fails one lesson, not the run.
 */
export const QUOTA_MESSAGE = /usage limit|rate limit|limit reached|quota|insufficient.balance/i;
