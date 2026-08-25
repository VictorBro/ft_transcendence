import type { Locale } from '@ft/shared';

import type { LegalDocument } from '../legal';
import * as en from './en';
import * as fr from './fr';
import * as de from './de';

/** What every per-locale content file exports, so the registry stays type-checked. */
export interface LegalContent {
  privacyPolicy: LegalDocument;
  termsOfService: LegalDocument;
  legalDocuments: LegalDocument[];
}

/**
 * Locales whose legal text is actually written. Add a locale here in the same
 * commit that adds its file, and both the unit tests and the rendered length
 * gate start covering it automatically.
 */
const CATALOGUE: Partial<Record<Locale, LegalContent>> = { en, fr, de };

/** Locales with their own text. Drives the per-language assertions in legal.test.ts. */
export const TRANSLATED_LOCALES = Object.keys(CATALOGUE) as Locale[];

/**
 * Falls back to English rather than 404ing or rendering an empty article:
 * missing legal pages are a subject rejection criterion, so an untranslated
 * locale has to show real text in *some* language. The fallback is deliberately
 * visible through TRANSLATED_LOCALES instead of silent.
 */
export function getLegalContent(locale: Locale): LegalContent {
  return CATALOGUE[locale] ?? en;
}
