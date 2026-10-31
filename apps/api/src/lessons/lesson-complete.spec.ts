import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { LessonOutlineFileSchema, lessons } from '@ft/shared';

import { complete } from '../../scripts/lessons/complete';
import { canonicalJson, type Json } from '../../scripts/lessons/json';
import { pagesOf } from '../../scripts/lessons/times';

/**
 * The complete step of the authoring kit (#83, scripts/lessons/complete.ts):
 * from a lesson stripped of everything the model is told to leave out, it
 * must give back the prototype lesson's numbers to the second, and a lesson
 * validateLesson accepts. One or two prototype lessons of each kind.
 */

// vitest runs with the package as cwd.
const FIXTURES = join(process.cwd(), '../../packages/shared/test/fixtures');
const read = (path: string): Json => JSON.parse(readFileSync(join(FIXTURES, path), 'utf8'));
const outline = LessonOutlineFileSchema.parse(read('samples/outlines/fr-a1.json'));
const ctx = { lang: outline.lang, level: outline.level, model: 'test', promptVersion: 'test' };

const LESSONS = [
  ['fr-classroom-objects', 'content'],
  ['fr-classroom-instructions', 'content'],
  ['fr-verb-etre-present', 'samples'],
  ['fr-negation-ne-pas', 'samples'],
  ['fr-ordering-at-a-cafe', 'samples'],
  ['fr-greetings-and-goodbyes', 'samples'],
  ['fr-reading-a-text-message', 'samples'],
] as const;

/** The fields the model may leave out at the top of a file (prompt.ts lists them). */
const ENVELOPE = [
  ...['schemaVersion', 'id', 'lang', 'level', 'locales', 'kind', 'topic', 'theme'],
  ...['scoring', 'provenance', 'estimatedMinutes', 'targetCount'],
];

/** Removes every key in `keys`, at any depth. */
function strip(value: Json, keys: string[]): void {
  if (Array.isArray(value)) value.forEach((v) => strip(v, keys));
  else if (value && typeof value === 'object')
    for (const k of Object.keys(value)) {
      if (keys.includes(k)) delete value[k];
      else strip(value[k], keys);
    }
}

/** A prototype lesson, and the same lesson as the model is asked to write it. */
function lessonAndDraft(id: string, folder: 'samples' | 'content') {
  const entry = outline.entries.find((e) => e.id === id)!;
  const hasContent = lessons.hasContentFile(entry.kind);
  const original = {
    brief: read(`${folder}/briefs/${id}.json`),
    content: hasContent ? read(`${folder}/lessons/${id}.json`) : undefined,
  };
  const draft = structuredClone(original);
  for (const file of [draft.brief, draft.content])
    for (const k of ENVELOPE) if (file) delete file[k];
  if (draft.content) {
    delete draft.content.title;
    delete draft.content.objective;
  }
  if (entry.kind === 'functions' || entry.kind === 'reading')
    strip(draft.content, ['estimatedDurationS', 'timeLimitS', 'skimSeconds']);
  if (entry.kind === 'grammar') strip(draft.content, ['timeLimitS']);
  return { entry, original, draft };
}

/** Every number complete() computes, in one comparable value. */
const times = (lesson: { brief: Json; content?: Json }) => ({
  brief: [lesson.brief.estimatedMinutes, lesson.brief.targetCount],
  content: lesson.content && {
    minutes: lesson.content.estimatedMinutes,
    pages: pagesOf(lesson.content).map((p) => [
      p.estimatedDurationS,
      p.timeLimitS,
      (p.items ?? []).map((i: Json) => i.skimSeconds),
    ]),
  },
});

describe('complete', () => {
  it.each(LESSONS)('turns the %s draft into a valid lesson', (id, folder) => {
    const { entry, draft } = lessonAndDraft(id, folder);
    const done = complete(draft, { ...ctx, entry });
    const result = lessons.validateLesson(done.brief, done.content, { ...ctx, entry });
    expect(result.ok ? [] : result.issues).toEqual([]);
  });

  it.each(LESSONS)('gives the %s durations, limits and minutes to the second', (id, folder) => {
    const { entry, original, draft } = lessonAndDraft(id, folder);
    expect(times(complete(draft, { ...ctx, entry }))).toEqual(times(original));
  });

  it('records where the files come from, the content hashed with its brief', () => {
    const { entry, draft } = lessonAndDraft('fr-ordering-at-a-cafe', 'samples');
    const done = complete(draft, { ...ctx, entry });
    expect(done.brief.provenance).toMatchObject({
      model: 'test',
      inputHashes: { outline: expect.any(String) },
    });
    expect(done.brief.provenance.inputHashes.brief).toBeUndefined();
    expect(done.content.provenance.inputHashes.brief).toMatch(/^[0-9a-f]{64}$/);
    expect(done.content.title).toBe(done.brief.title);
  });

  it('drops a content file sent for a vocabulary lesson, and leaves the draft as it was', () => {
    const { entry, draft } = lessonAndDraft('fr-classroom-objects', 'content');
    const before = structuredClone(draft);
    const done = complete({ ...draft, content: { steps: [] } }, { ...ctx, entry });
    expect(done.content).toBeUndefined();
    expect(draft).toEqual(before);
  });
});

describe('canonicalJson', () => {
  it('sorts the keys at every depth and drops the whitespace', () => {
    expect(canonicalJson({ b: [{ d: 1, c: 2 }], a: 'x' })).toBe('{"a":"x","b":[{"c":2,"d":1}]}');
  });
});
