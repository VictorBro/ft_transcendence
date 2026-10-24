import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { LessonOutlineFileSchema } from '../../schemas/lesson';
import {
  countWords,
  documentWords,
  highlightRanges,
  READING_SKIM_WPM,
  readingMinutes,
  readingPageEstimate,
  readingSkimSeconds,
  readingTimeLimit,
} from '../domain/readingLesson';
import { briefSchema, contentSchema, isSupportedKind } from '../schemas/artifacts';
import { READING_WORDS, type ReadingContent } from '../schemas/reading';
import { validateBrief, validateContent, type OutlineContext } from './artifacts';

/**
 * Ported from the lesson prototype (describe('reading artifacts') of
 * tests/unit/reading.test.tsx at 928484d), on its sample lesson in
 * packages/shared/test/fixtures/samples.
 */

const SAMPLES = join(__dirname, '../../../test/fixtures/samples');
const ID = 'fr-reading-a-text-message';
// The sample is edited freely by each test, so it is read untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const load = (dir: 'briefs' | 'lessons'): Json =>
  JSON.parse(readFileSync(join(SAMPLES, dir, `${ID}.json`), 'utf8'));
const outline = LessonOutlineFileSchema.parse(
  JSON.parse(readFileSync(join(SAMPLES, 'outlines/fr-a1.json'), 'utf8')),
);
const ctx: OutlineContext = {
  entry: outline.entries.find((e) => e.id === ID)!,
  lang: 'fr',
  level: 'A1',
};
const messages = (r: { issues: { path: string; message: string }[] }) =>
  r.issues.map((i) => `${i.path}: ${i.message}`).join('\n');
const page = (c: Json, stage: string) => c.steps.find((s: Json) => s.stage === stage).pages[0];

function checkBrief(mutate?: (b: Json) => void) {
  const brief = load('briefs');
  mutate?.(brief);
  return validateBrief(brief, ctx);
}
function checkContent(mutate?: (c: Json) => void) {
  const content = load('lessons');
  mutate?.(content);
  return validateContent(content, { ...ctx, brief: load('briefs') });
}

describe('reading artifacts', () => {
  it('registers reading as a supported kind', () => {
    expect(isSupportedKind('reading')).toBe(true);
    expect(() => z.toJSONSchema(briefSchema('reading', 'fr'))).not.toThrow();
    expect(() => z.toJSONSchema(contentSchema('reading', 'fr'))).not.toThrow();
  });

  it('accepts the sample brief and lesson content', () => {
    expect(messages(checkBrief())).toBe('');
    expect(messages(checkContent())).toBe('');
  });

  it.each([
    ['too few key words', (b: Json) => b.keywords.splice(3), /keywords/],
    [
      'equal matching labels',
      (b: Json) => (b.keywords[1].translations.en = ['Saturday']),
      /en matching label/,
    ],
    [
      'a main document too long for A1',
      (b: Json) => (b.documents.main.targetWords = 120),
      /the main document has 120 words; 40–80/,
    ],
    ['a topic instead of a theme', (b: Json) => (b.topic = 'pronouns'), /topic/],
  ])('rejects a brief with %s', (_, mutate, pattern) => {
    expect(messages(checkBrief(mutate))).toMatch(pattern);
  });

  it.each([
    [
      'a highlight missing from the text',
      (c: Json) => (c.documents[0].highlights[0].text = 'dimanche'),
      /"dimanche" is not in the document/,
    ],
    [
      'a highlight found only inside a longer word',
      (c: Json) => (c.documents[0].highlights[0].text = 'same'),
      /"same" is not in the document as a whole word/,
    ],
    [
      'an exam question that repeats a detail question',
      (c: Json) => (page(c, 'exam').items[1].question = page(c, 'detail').items[1].question),
      /repeats a skim or detail question/,
    ],
    [
      'an exam document that repeats the main document',
      (c: Json) => (c.documents[1].paragraphs[0] = c.documents[0].paragraphs[0]),
      /repeats a paragraph of the main document/,
    ],
    [
      'a key word never highlighted',
      (c: Json) => c.documents[0].highlights.splice(0, 1),
      /key word samedi is never highlighted/,
    ],
    [
      'a highlight in the exam document',
      (c: Json) => c.documents[1].highlights.push({ keywordId: 'samedi', text: 'Salut' }),
      /exam document lists no highlights/,
    ],
    [
      'a main document of 200 words',
      (c: Json) => c.documents[0].paragraphs.push(Array(160).fill('mot').join(' ')),
      /the main document has \d+ words/,
    ],
    [
      'the exam document on the skim page',
      (c: Json) => (page(c, 'skim').items[0].documentId = 'exam'),
      /shows the main document in the skim view/,
    ],
    [
      'a skim time out of bounds',
      (c: Json) => (page(c, 'skim').items[0].skimSeconds = 5),
      /skimSeconds/,
    ],
    [
      'an estimate that ignores the skim time',
      (c: Json) => (page(c, 'skim').items[0].skimSeconds = 60),
      /must be 80 s by READING_PAGE_RULES/,
    ],
    [
      'a skim question with another focus',
      (c: Json) => (page(c, 'skim').items[1].focus = 'author'),
      /asks about purpose/,
    ],
    [
      'detail questions out of the brief order',
      (c: Json) => page(c, 'detail').items.reverse(),
      /one document, first on the page/,
    ],
    [
      'a missing detail question',
      (c: Json) => page(c, 'detail').items.pop(),
      /expected the brief's questions in order/,
    ],
    [
      'two right options',
      (c: Json) =>
        (page(c, 'detail').items[1].options[1].text = page(c, 'detail').items[1].options[0].text),
      /duplicate option text/,
    ],
    [
      'an order that skips a piece',
      (c: Json) => (page(c, 'structure').items[1].acceptedOrders = [['p1', 'p2']]),
      /uses every piece exactly once/,
    ],
    ['four exam questions', (c: Json) => page(c, 'exam').items.pop(), /5 questions/],
    ['a wrong exam limit', (c: Json) => (page(c, 'exam').timeLimitS = 100), /must be 190 s/],
    [
      'a practice countdown',
      (c: Json) => (page(c, 'detail').timeLimitS = 60),
      /only the exam page has a countdown/,
    ],
    ['steps out of order', (c: Json) => c.steps.reverse(), /expected the flashcards step/],
  ])('rejects lesson content with %s', (_, mutate, pattern) => {
    expect(messages(checkContent(mutate))).toMatch(pattern);
  });

  it('counts words and derives skim time, estimates and the exam limit from the page rules', () => {
    expect(countWords("Rendez-vous à 15 h, l'heure : 9 € ?")).toBe(6);
    const content = load('lessons') as ReadingContent;
    const documents = new Map(content.documents.map((d) => [d.documentId, d]));
    expect(documentWords(documents.get('main')!)).toBe(55);
    expect(readingSkimSeconds(documents.get('main')!, 'A1')).toBe(45);
    expect(readingSkimSeconds(documents.get('main')!, 'C2')).toBe(20);
    expect(readingPageEstimate(page(content, 'flashcards').items, documents, 'A1', false)).toBe(50);
    expect(readingPageEstimate(page(content, 'detail').items, documents, 'A1', false)).toBe(4 * 30);
    expect(readingPageEstimate(page(content, 'exam').items, documents, 'A1', true)).toBe(
      25 + 5 * 20,
    );
    expect(readingTimeLimit(125)).toBe(190);
    expect(content.estimatedMinutes).toBe(8);
  });

  it('keeps the largest lesson of every level within 15 minutes with the page rules', () => {
    // 6 key words, 4 detail questions, 6 pieces, 5 exam questions and both documents at the top of their word range.
    const doc = (documentId: 'main' | 'exam', words: number) =>
      ({
        documentId,
        title: null,
        meta: [],
        paragraphs: [Array(words).fill('mot').join(' ')],
        highlights: [],
      }) as unknown as ReadingContent['documents'][number];
    const ids = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'];
    const q = (n: number) => Array.from({ length: n }, () => ({ type: 'reading_choice' }));
    for (const level of Object.keys(READING_SKIM_WPM) as (keyof typeof READING_SKIM_WPM)[]) {
      const [main, exam] = [
        doc('main', READING_WORDS[level].main[1]),
        doc('exam', READING_WORDS[level].exam[1]),
      ];
      const documents = new Map([
        ['main', main],
        ['exam', exam],
      ]);
      const pages = [
        [{ type: 'reading_flashcards', keywordIds: ids }],
        [{ type: 'reading_keyword_matching', keywordIds: ids }],
        [
          {
            type: 'reading_document',
            documentId: 'main',
            view: 'skim',
            skimSeconds: readingSkimSeconds(main, level),
          },
          { type: 'reading_skim_choice' },
        ],
        [{ type: 'reading_document', documentId: 'main', view: 'detail' }, ...q(4)],
        [
          { type: 'reading_document', documentId: 'main', view: 'structure' },
          { type: 'reading_order', pieces: ids },
        ],
        [{ type: 'reading_document', documentId: 'exam', view: 'exam' }, ...q(5)],
      ] as unknown as ReadingContent['steps'][number]['pages'][number]['items'][];
      const minutes = readingMinutes(
        pages.map((items, i) => readingPageEstimate(items, documents, level, i === 5)),
      );
      expect(minutes, level).toBeLessThanOrEqual(15);
    }
  });

  it('marks key words as whole words only, the longer one first at the same position', () => {
    const at = (text: string, words: string[]) =>
      highlightRanges(text, words).map((r) => `${r.at}:${r.word}`);
    expect(at('Entrées\nEntrée + plat', ['Entrée'])).toEqual(['8:Entrée']);
    expect(at('l’entrée, on se voit ? On se voit.', ['entrée', 'on se voit', 'on'])).toEqual([
      '2:entrée',
      '10:on se voit',
    ]);
    expect(at('samedi', ['same'])).toEqual([]);
  });
});
