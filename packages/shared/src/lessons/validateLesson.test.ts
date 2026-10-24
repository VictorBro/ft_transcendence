import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LessonOutlineFileSchema } from '../schemas/lesson';
import type { OutlineContext } from './validation/artifacts';
import { validateLesson, type LessonValidation } from './validateLesson';

const FIXTURES = join(__dirname, '../../test/fixtures');
const outline = LessonOutlineFileSchema.parse(
  JSON.parse(readFileSync(join(FIXTURES, 'samples/outlines/fr-a1.json'), 'utf8')),
);
const ctx = (id: string): OutlineContext => ({
  entry: outline.entries.find((e) => e.id === id)!,
  lang: outline.lang,
  level: outline.level,
});

// The files are edited freely by each test, so they are read untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
/** samples/: complete lessons. content/: short ones, too short for the grammar length rules. */
const read = (folder: 'samples' | 'content', file: 'briefs' | 'lessons', id: string): Json =>
  JSON.parse(readFileSync(join(FIXTURES, folder, file, `${id}.json`), 'utf8'));

function check(
  id: string,
  edit: { brief?: (b: Json) => void; content?: (c: Json) => void } = {},
  folder: 'samples' | 'content' = 'samples',
) {
  const brief = read(folder, 'briefs', id);
  edit.brief?.(brief);
  let content: Json;
  try {
    content = read(folder, 'lessons', id);
    edit.content?.(content);
  } catch {
    content = undefined; // a vocabulary lesson has no content file
  }
  return validateLesson(brief, content, ctx(id));
}

const issuesOf = (r: LessonValidation) =>
  r.ok ? '' : r.issues.map((i) => `${i.path}: ${i.message}`).join('\n');

/** Sets the title in both files, which must say the same. */
const retitle = (title: string) => ({
  brief: (b: Json) => (b.title = title),
  content: (c: Json) => (c.title = title),
});

describe('validateLesson', () => {
  it.each([
    ['fr-verb-etre-present', 'grammar'],
    ['fr-negation-ne-pas', 'grammar'],
    ['fr-ordering-at-a-cafe', 'functions'],
    ['fr-greetings-and-goodbyes', 'functions'],
    ['fr-reading-a-text-message', 'reading'],
  ])('accepts the %s sample (%s), with the title and summary to store', (id, kind) => {
    const r = check(id);
    expect(issuesOf(r)).toBe('');
    if (!r.ok) return;
    expect(r.brief.kind).toBe(kind);
    expect(r.content?.kind).toBe(kind);
    expect(r.title).toBe(r.brief.title);
    expect(r.summary).toBe(r.brief.objective.fr);
  });

  it('accepts a vocabulary lesson, which is its brief alone', () => {
    const r = validateLesson(
      read('content', 'briefs', 'fr-classroom-objects'),
      undefined,
      ctx('fr-classroom-objects'),
    );
    expect(issuesOf(r)).toBe('');
    expect(r.ok && r.content).toBeNull();
  });

  it('rejects a content file for a vocabulary lesson', () => {
    const r = validateLesson(
      read('content', 'briefs', 'fr-classroom-objects'),
      {},
      ctx('fr-classroom-objects'),
    );
    expect(issuesOf(r)).toMatch(/^content: vocabulary lessons have no content file/m);
  });

  it('rejects a lesson of another kind without its content file', () => {
    const r = validateLesson(
      read('samples', 'briefs', 'fr-ordering-at-a-cafe'),
      undefined,
      ctx('fr-ordering-at-a-cafe'),
    );
    expect(issuesOf(r)).toBe(
      'content: a functions lesson needs its content file, content/lessons/fr-ordering-at-a-cafe.json',
    );
  });

  // The trap the issue warns about: validateBrief and validateContent alone accept these.
  it.each(['fr-verb-etre-present', 'fr-negation-ne-pas'])(
    'rejects the short %s grammar fixture by the length rules',
    (id) => {
      const found = issuesOf(check(id, {}, 'content'));
      expect(found).toMatch(/^brief\.[^\n]*\(GRAMMAR_LENGTH\)$/m);
      expect(found).toMatch(/^content\.[^\n]*\(GRAMMAR_LENGTH\)$/m);
      expect(found.split('\n').every((line) => /GRAMMAR_LENGTH/.test(line))).toBe(true);
    },
  );

  it('rejects a title of 81 characters, which the lesson card could not carry', () => {
    expect(issuesOf(check('fr-reading-a-text-message', retitle('a'.repeat(80))))).toBe('');
    expect(issuesOf(check('fr-reading-a-text-message', retitle('a'.repeat(81))))).toMatch(
      /^brief\.title: Too big: expected string to have <=80 characters$/,
    );
  });

  it('rejects a title on two lines', () => {
    expect(issuesOf(check('fr-reading-a-text-message', retitle('Lire\nun SMS')))).toMatch(
      /^brief\.title: must not contain line breaks/,
    );
  });

  it('rejects an objective over 200 characters in the course language only', () => {
    const objective = (locale: string, text: string) => ({
      brief: (b: Json) => (b.objective[locale] = text),
      content: (c: Json) => (c.objective[locale] = text),
    });
    expect(issuesOf(check('fr-ordering-at-a-cafe', objective('fr', 'a'.repeat(200))))).toBe('');
    expect(issuesOf(check('fr-ordering-at-a-cafe', objective('fr', 'a'.repeat(201))))).toMatch(
      /^brief\.objective\.fr: Too big: expected string to have <=200 characters$/,
    );
    // The objective in a mother tongue is never stored, so only its schema limit (300) applies.
    expect(issuesOf(check('fr-ordering-at-a-cafe', objective('en', 'a'.repeat(250))))).toBe('');
  });

  it('requires the content file to repeat the brief title and objective', () => {
    expect(
      issuesOf(check('fr-ordering-at-a-cafe', { content: (c) => (c.title = 'Au café') })),
    ).toBe("content.title: must equal the brief's title");
    expect(
      issuesOf(check('fr-ordering-at-a-cafe', { content: (c) => (c.objective.de = 'Anders.') })),
    ).toBe("content.objective: must equal the brief's objective");
  });

  it('reports only the brief when the brief is invalid', () => {
    const r = check('fr-verb-etre-present', {
      brief: (b) => (b.blocks[0].ruleIds = ['r-unknown']),
      content: (c) => (c.steps = []),
    });
    expect(issuesOf(r)).toMatch(/^brief\.blocks\.0\.ruleIds: unknown rule r-unknown$/m);
    expect(issuesOf(r)).not.toMatch(/^content/m);
  });

  it('names the file of each issue, the brief first', () => {
    const r = check('fr-ordering-at-a-cafe', {
      brief: (b) => (b.title = 'a'.repeat(81)),
      content: (c) => (c.steps[0].pages[0].estimatedDurationS = 61),
    });
    // The content is invalid, so its title is not compared with the brief's.
    expect(issuesOf(r).split('\n')).toEqual([
      'brief.title: Too big: expected string to have <=80 characters',
      'content.steps.0.pages.0.estimatedDurationS: must be 40 s by FUNCTIONS_PAGE_RULES',
    ]);
  });

  it('returns the parsed files, with their texts trimmed', () => {
    const r = check('fr-reading-a-text-message', retitle('  Lire un SMS  '));
    expect(issuesOf(r)).toBe('');
    expect(r.ok && [r.title, r.brief.title, r.content?.title]).toEqual([
      'Lire un SMS',
      'Lire un SMS',
      'Lire un SMS',
    ]);
  });

  it('rejects a lesson that is not the one its outline entry plans', () => {
    const r = validateLesson(
      read('samples', 'briefs', 'fr-ordering-at-a-cafe'),
      read('samples', 'lessons', 'fr-ordering-at-a-cafe'),
      ctx('fr-asking-the-way'),
    );
    expect(issuesOf(r)).toMatch(/^brief\.id: must equal the outline ID fr-asking-the-way$/m);
  });
});
