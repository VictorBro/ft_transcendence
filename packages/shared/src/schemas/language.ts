import { z } from 'zod';

/**
 * The languages a learner can study, mirroring the `Language` enum in
 * schema.prisma.
 *
 * Deliberately not `Locale`, which is the language the interface is rendered
 * in: an English speaker learning French sets one to `en` and the other to
 * `fr`, so a single enum could not express that row. The two lists happen to
 * match today and are free to diverge the day something becomes learnable that
 * the interface is not translated into.
 */
export const LEARNABLE_LANGUAGES = ['en', 'fr', 'de'] as const;

export const LanguageSchema = z.enum(LEARNABLE_LANGUAGES);
export type Language = z.infer<typeof LanguageSchema>;
