import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { type Locale, SUPPORTED_LOCALES, type lessons } from '@ft/shared';

import { discussionPrompt, teachingFacts } from './discussion-prompt';

// vitest runs with the package as cwd.
const SAMPLES = join(process.cwd(), '../../packages/shared/test/fixtures/samples');
const CONTENT = join(process.cwd(), '../..', 'content');

const read = (dir: string, folder: string, id: string): unknown =>
  JSON.parse(readFileSync(join(dir, folder, `${id}.json`), 'utf8'));

/** PR #142's sample of each kind but vocabulary, which has no sample. */
const sample = (id: string) => read(SAMPLES, 'briefs', id) as lessons.Brief;

interface ReadingLesson {
  id: string;
  brief: Extract<lessons.Brief, { kind: 'reading' }>;
  content: { documents: { documentId: string; meta: string[]; paragraphs: string[] }[] };
}

/** PR #142's reading sample, and every written reading lesson: those with both files. */
function readingLessons(): ReadingLesson[] {
  const written = existsSync(join(CONTENT, 'lessons'))
    ? readdirSync(join(CONTENT, 'lessons'))
        .map((name) => name.slice(0, -'.json'.length))
        .filter((id) => existsSync(join(CONTENT, 'briefs', `${id}.json`)))
        .map((id) => ({ id, dir: CONTENT }))
    : [];
  return [{ id: 'fr-reading-a-text-message', dir: SAMPLES }, ...written]
    .map(({ id, dir }) => ({
      id,
      brief: read(dir, 'briefs', id) as ReadingLesson['brief'],
      content: read(dir, 'lessons', id) as ReadingLesson['content'],
    }))
    .filter(({ brief }) => brief.kind === 'reading');
}

describe('discussionPrompt', () => {
  const reading = readingLessons();

  it('finds reading lessons to check', () => {
    expect(reading.length).toBeGreaterThan(1);
  });

  // The exam asks about a new document of the same genre: the tutor must know neither.
  describe.each(reading)('$id', ({ brief, content }) => {
    const exam = content.documents.find((document) => document.documentId === 'exam');

    it.each(SUPPORTED_LOCALES)('holds neither the exam document nor the genre, in %s', (locale) => {
      const prompt = discussionPrompt(brief, locale);

      expect(exam?.paragraphs.length).toBeGreaterThan(0);
      for (const paragraph of exam?.paragraphs ?? []) expect(prompt).not.toContain(paragraph);
      // The field, not the word: a situation may say "an email" or "a magazine profiles", and may.
      expect(teachingFacts(brief, locale)).not.toHaveProperty('genre');
      expect(prompt).not.toContain('"genre"');
      expect(prompt).not.toContain(brief.documents.exam.contents[locale]);
      expect(prompt).not.toContain(brief.documents.main.contents[locale]);
    });
  });

  it('names the course language, the level and the language to answer in', () => {
    const prompt = discussionPrompt(sample('fr-negation-ne-pas'), 'de');

    expect(prompt).toContain('tutor of one French lesson, level A1');
    expect(prompt).toContain('Answer in German');
    expect(prompt).toContain('Write French examples in French');
  });

  it('ends with the teaching facts as JSON', () => {
    const brief = sample('fr-ordering-at-a-cafe');
    const prompt = discussionPrompt(brief, 'en');

    const json = prompt.slice(prompt.indexOf('{'));
    expect(JSON.parse(json)).toEqual(teachingFacts(brief, 'en'));
  });
});

describe('teachingFacts', () => {
  const locale: Locale = 'fr';

  it('keeps of a grammar lesson its objective, rules, explanations, examples and new verbs', () => {
    const brief = sample('fr-negation-ne-pas') as Extract<lessons.Brief, { kind: 'grammar' }>;

    expect(teachingFacts(brief, locale)).toEqual({
      objective: brief.objective.fr,
      rules: brief.rules.map((rule) => rule.summary.fr),
      blocks: brief.blocks.map((block) => ({
        explanation: block.explanationPlan.fr,
        examples: block.examples,
      })),
      newVerbs: brief.newVerbs,
    });
  });

  it('keeps of a functions lesson its situation, roles, expressions and words', () => {
    const brief = sample('fr-ordering-at-a-cafe') as Extract<lessons.Brief, { kind: 'functions' }>;
    const facts = teachingFacts(brief, locale) as Record<string, unknown>;

    expect(Object.keys(facts)).toEqual(['situation', 'roles', 'expressions', 'words']);
    expect(facts.situation).toBe(brief.situation.fr);
    expect(facts.expressions).toEqual(
      brief.expressions.map((expression) => ({
        text: expression.text,
        translations: expression.translations,
        explanation: expression.explanation.fr,
        example: expression.example,
      })),
    );
  });

  it('keeps of a reading lesson its situation, task and key words, and no document', () => {
    const brief = sample('fr-reading-a-text-message') as Extract<
      lessons.Brief,
      { kind: 'reading' }
    >;

    expect(teachingFacts(brief, locale)).toEqual({
      situation: brief.situation.fr,
      readerTask: brief.readerTask.fr,
      keywords: brief.keywords.map((keyword) => ({
        term: keyword.term,
        translations: keyword.translations,
        explanation: keyword.explanation.fr,
      })),
    });
  });

  it('keeps of a vocabulary lesson its objective and each word, without its exam forms', () => {
    const brief = read(
      join(process.cwd(), '../../packages/shared/test/fixtures/content'),
      'briefs',
      'fr-classroom-objects',
    ) as Extract<lessons.Brief, { kind: 'vocabulary' }>;

    expect(teachingFacts(brief, locale)).toEqual({
      objective: brief.objective.fr,
      words: brief.targets.map((target) => ({
        term: target.term,
        teachingForm: target.teachingForm,
        translations: target.translations,
        context: target.context,
      })),
    });
  });

  it('gives each help text in the interface language only', () => {
    const brief = sample('fr-negation-ne-pas');
    const facts = JSON.stringify(teachingFacts(brief, 'de'));

    expect(facts).toContain(brief.objective.de);
    expect(facts).not.toContain(brief.objective.en);
  });
});
