import type { Language } from '../../schemas/language';
import { SUPPORTED_LOCALES, type Locale } from '../../schemas/locale';

/**
 * The mother tongue of an attempt: the language its native prompts and
 * labels are in. It is the interface locale, unless that is the course
 * language itself (a French interface on the French course); then it is
 * the first other locale in en, fr, de order. There is no profile
 * setting for it.
 *
 *   motherTongue('de', 'fr') → 'de'
 *   motherTongue('fr', 'fr') → 'en'
 *   motherTongue('en', 'en') → 'fr'
 */
export function motherTongue(locale: Locale, lang: Language): Locale {
  return locale !== lang ? locale : SUPPORTED_LOCALES.find((l) => l !== lang)!;
}
