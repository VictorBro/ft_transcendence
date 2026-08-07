import { z } from 'zod';

/**
 * The i18n minor module needs three languages minimum. This tuple is the single
 * place that list lives: next-intl routing, the API's Accept-Language handling
 * and the User model all derive from it.
 */
export const SUPPORTED_LOCALES = ['en', 'fr', 'de'] as const;

export const LocaleSchema = z.enum(SUPPORTED_LOCALES);
export type Locale = z.infer<typeof LocaleSchema>;

export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: unknown): value is Locale {
  return LocaleSchema.safeParse(value).success;
}
