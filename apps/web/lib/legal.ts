/**
 * Legal pages are a subject rejection criterion, so their text is data rather
 * than JSX: a unit test can then assert the same length the CI gate asserts on
 * the rendered page, and the failure shows up before the browser run.
 */

export const LEGAL_MINIMUM_CHARACTERS = 1500;

/**
 * Addresses use the RFC 2606 reserved `.example` TLD on purpose: this is an
 * academic build with no registered domain yet. Swap both before any public
 * deployment, or the contact obligations below cannot be honoured.
 *
 * They sit here rather than in each translation because an address that varies
 * per language is an address someone eventually mistypes, and because every
 * per-locale content file already imports this module for the types below.
 */
export const PRIVACY_CONTACT_EMAIL = 'privacy@ft-transcendence.example';
export const LEGAL_CONTACT_EMAIL = 'legal@ft-transcendence.example';

export interface LegalSection {
  id: string;
  heading: string;
  paragraphs: string[];
}

export interface LegalDocument {
  slug: string;
  title: string;
  description: string;
  /** Fixed string, never a computed date: rendering Date.now() breaks hydration. */
  lastUpdated: string;
  intro: string;
  sections: LegalSection[];
}

export function legalDocumentText(doc: LegalDocument): string {
  const body = doc.sections.flatMap((section) => [section.heading, ...section.paragraphs]);
  return [doc.intro, ...body].join('\n\n');
}

export function legalDocumentLength(doc: LegalDocument): number {
  return legalDocumentText(doc).length;
}

export function legalSectionIds(doc: LegalDocument): string[] {
  return doc.sections.map((section) => section.id);
}
