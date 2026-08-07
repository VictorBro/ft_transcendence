import { describe, expect, it } from 'vitest';

import {
  legalDocumentLength,
  legalDocumentText,
  legalSectionIds,
  LEGAL_MINIMUM_CHARACTERS,
  type LegalDocument,
} from './legal';
import { legalDocuments, privacyPolicy, termsOfService } from './legal-content';

const stub: LegalDocument = {
  slug: 'stub',
  title: 'Stub',
  description: 'Stub document.',
  lastUpdated: '2026-08-01',
  intro: 'Intro.',
  sections: [{ id: 'one', heading: 'One', paragraphs: ['A.', 'B.'] }],
};

// Typed as tuples so each() hands the callback (string, LegalDocument) rather
// than a union of both.
const published: [string, LegalDocument][] = [
  ['privacy policy', privacyPolicy],
  ['terms of service', termsOfService],
];

describe('legalDocumentText', () => {
  it('concatenates intro, headings and paragraphs in order', () => {
    expect(legalDocumentText(stub)).toBe('Intro.\n\nOne\n\nA.\n\nB.');
  });

  it('measures the concatenated text', () => {
    expect(legalDocumentLength(stub)).toBe(legalDocumentText(stub).length);
  });
});

describe('legalSectionIds', () => {
  it('lists section ids in document order', () => {
    expect(legalSectionIds(stub)).toEqual(['one']);
  });
});

describe.each(published)('%s', (_name, doc) => {
  // The subject rejects placeholder legal pages and CI asserts the rendered
  // length. Failing here points at the content instead of at a browser run.
  it(`is at least ${LEGAL_MINIMUM_CHARACTERS} characters long`, () => {
    expect(legalDocumentLength(doc)).toBeGreaterThanOrEqual(LEGAL_MINIMUM_CHARACTERS);
  });

  it('has a stable, unique anchor for every section', () => {
    const ids = legalSectionIds(doc);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it('has no empty section', () => {
    for (const section of doc.sections) {
      expect(section.heading.trim()).not.toBe('');
      expect(section.paragraphs.length).toBeGreaterThan(0);
      for (const paragraph of section.paragraphs) {
        expect(paragraph.trim().length).toBeGreaterThan(40);
      }
    }
  });

  it('carries a fixed last-updated date so the markup never drifts per request', () => {
    expect(doc.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('has metadata the layout can render', () => {
    expect(doc.title.trim()).not.toBe('');
    expect(doc.description.trim().length).toBeGreaterThan(40);
    expect(doc.intro.trim().length).toBeGreaterThan(40);
  });
});

describe('legalDocuments', () => {
  it('exposes both documents under unique slugs', () => {
    expect(legalDocuments.map((doc) => doc.slug)).toEqual(['privacy', 'terms']);
  });
});
