/**
 * Legal pages are a subject rejection criterion, so their text is data rather
 * than JSX: a unit test can then assert the same length the CI gate asserts on
 * the rendered page, and the failure shows up before the browser run.
 */

export const LEGAL_MINIMUM_CHARACTERS = 1500;

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
