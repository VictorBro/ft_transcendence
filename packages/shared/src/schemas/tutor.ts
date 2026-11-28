import { z } from 'zod';

/** LLM_PROVIDER, which the api checks at boot (apps/api/src/llm/llm.factory.ts). */
export const LlmProviderNameSchema = z.enum(['fixture', 'gemini', 'disabled']);
export type LlmProviderName = z.infer<typeof LlmProviderNameSchema>;

/**
 * GET /api/tutor: what the lesson tutor runs on. model is null when no real
 * model is behind it. Never the key, nor any part of it.
 */
export const TutorInfoSchema = z.object({
  provider: LlmProviderNameSchema,
  model: z.string().min(1).nullable(),
});
export type TutorInfo = z.infer<typeof TutorInfoSchema>;

/**
 * How a check of the server's key ended (POST /api/tutor/check). The check asks
 * the model for one word, as a learner's question would, so it uses one request
 * of the key's quota:
 * - ok: Google answered the one-word test: the key, the model and the quota all work.
 * - invalid_key: 400 API_KEY_INVALID, 401 or 403: wrong, revoked, blocked or leaked.
 * - model_not_found: 404: no such model, or none that can write text.
 * - quota: 429 for the key's quota of the minute (or a 429 that does not say which).
 * - quota_day: 429 for the key's quota of the day: used up until Google resets it.
 * - unreachable: no answer before the timeout, or Google's own 408 or 5xx.
 * - unexpected: any other answer; httpStatus says which, the api log says why.
 *   httpStatus is null when the check itself failed before Google answered.
 * - fixture, disabled: no real LLM, nothing to check.
 */
export const TUTOR_CHECK_STATUSES = [
  'ok',
  'invalid_key',
  'model_not_found',
  'quota',
  'quota_day',
  'unreachable',
  'unexpected',
  'fixture',
  'disabled',
] as const;
export const TutorCheckStatusSchema = z.enum(TUTOR_CHECK_STATUSES);
export type TutorCheckStatus = z.infer<typeof TutorCheckStatusSchema>;

export const TutorCheckSchema = TutorInfoSchema.extend({
  status: TutorCheckStatusSchema,
  /** Round trip to Google in whole ms; null when no call was made. */
  latencyMs: z.number().int().nonnegative().nullable(),
  /** Google's HTTP status; null with no answer or no call. */
  httpStatus: z.number().int().min(100).max(599).nullable(),
  /**
   * quota and quota_day: when Google said the quota comes back, from the wait it
   * gave with its 429. Null for every other status, or when Google gave no wait.
   */
  retryAt: z.iso.datetime().nullable(),
  checkedAt: z.iso.datetime(),
});
export type TutorCheck = z.infer<typeof TutorCheckSchema>;
