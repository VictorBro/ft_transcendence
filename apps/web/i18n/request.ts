import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';

/**
 * `requestLocale` is whatever the [locale] segment matched, or nothing at all
 * when the render happens outside it. Validating rather than trusting it is the
 * point: an unsupported value would otherwise reach the import below and fail
 * at module resolution instead of answering in the default language.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
