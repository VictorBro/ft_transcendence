import { z } from 'zod';

import { DEFAULT_LOCALE, LocaleSchema } from './locale';

/**
 * Query string of `GET /api/hello`. The defaults live in the schema rather than
 * in a controller so the browser and the server fill in the same values.
 */
export const HelloQuerySchema = z.object({
  name: z.string().trim().min(1).max(64).default('world'),
  locale: LocaleSchema.default(DEFAULT_LOCALE),
});
export type HelloQuery = z.infer<typeof HelloQuerySchema>;

export const HelloResponseSchema = z.object({
  message: z.string().min(1).max(280),
  locale: LocaleSchema,
  generatedAt: z.iso.datetime(),
});
export type HelloResponse = z.infer<typeof HelloResponseSchema>;
