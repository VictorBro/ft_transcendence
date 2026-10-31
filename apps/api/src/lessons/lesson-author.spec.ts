import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { LessonOutlineFileSchema, lessons } from '@ft/shared';

import { applyEdits, canonicalJson, complete, type Json } from '../../scripts/lessons/complete';

/**
 * The complete step of lessons:author (scripts/lessons/complete.ts): from
 * a lesson without the fields Claude is told to leave out, it must give
 * back a lesson the validators accept. Run on the prototype lessons that
 * @ft/shared tests with, one or more of each kind.
 */

// vitest runs with the package as cwd.
const FIXTURES = join(process.cwd(), '../../packages/shared/test/fixtures');
const read = (path: string): Json => JSON.parse(readFileSync(join(FIXTURES, path), 'utf8'));
const outline = LessonOutlineFileSchema.parse(read('samples/outlines/fr-a1.json'));

const ENVELOPE = [
  'schemaVersion',
  'id',
  'lang',
  'level',
  'locales',
  'kind',
  'topic',
  'theme',
  'scoring',
  'provenance',
  'estimatedMinutes',
  'targetCount',
];

/** Removes every `key` in `keys`, at any depth. */
function strip(value: Json, keys: string[]): void {
  if (Array.isArray(value)) value.forEach((v) => strip(v, keys));
  else if (value && typeof value === 'object')
    for (const k of Object.keys(value)) {
      if (keys.includes(k)) delete value[k];
      else strip(value[k], keys);
    }
}

/** The lesson as Claude is asked to write it: what the complete step computes is gone. */
function draftOf(id: string, folder: 'samples' | 'content') {
  const entry = outline.entries.find((e) => e.id === id)!;
  const brief = read(`${folder}/briefs/${id}.json`);
  const content = lessons.hasContentFile(entry.kind)
    ? read(`${folder}/lessons/${id}.json`)
    : undefined;
  for (const file of [brief, content]) for (const k of ENVELOPE) if (file) delete file[k];
  if (content) {
    delete content.title;
    delete content.objective;
  }
  if (entry.kind === 'functions' || entry.kind === 'reading')
    strip(content, ['estimatedDurationS', 'timeLimitS', 'skimSeconds']);
  if (entry.kind === 'grammar') strip(content, ['timeLimitS']);
  return { entry, draft: { brief, content } };
}

const ctx = { lang: outline.lang, level: outline.level, model: 'test', promptVersion: 'test' };

describe('complete', () => {
  it.each([
    ['fr-classroom-objects', 'content'],
    ['fr-classroom-instructions', 'content'],
    ['fr-verb-etre-present', 'samples'],
    ['fr-negation-ne-pas', 'samples'],
    ['fr-ordering-at-a-cafe', 'samples'],
    ['fr-greetings-and-goodbyes', 'samples'],
    ['fr-reading-a-text-message', 'samples'],
  ] as const)('turns the %s draft into a valid lesson', (id, folder) => {
    const { entry, draft } = draftOf(id, folder);
    const done = complete(draft, { ...ctx, entry });
    const result = lessons.validateLesson(done.brief, done.content, { ...ctx, entry });
    expect(result.ok ? [] : result.issues).toEqual([]);
  });

  it('gives the durations of the prototype lesson, to the second', () => {
    const { entry, draft } = draftOf('fr-reading-a-text-message', 'samples');
    const done = complete(draft, { ...ctx, entry });
    const original = read('samples/lessons/fr-reading-a-text-message.json');
    const times = (c: Json) =>
      c.steps.map((s: Json) => s.pages.map((p: Json) => [p.estimatedDurationS, p.timeLimitS]));
    expect(times(done.content)).toEqual(times(original));
    expect(done.content.estimatedMinutes).toBe(original.estimatedMinutes);
  });

  it('records where the files come from, the content hashed with its brief', () => {
    const { entry, draft } = draftOf('fr-ordering-at-a-cafe', 'samples');
    const done = complete(draft, { ...ctx, entry });
    expect(done.brief.provenance).toMatchObject({
      model: 'test',
      inputHashes: { outline: expect.any(String) },
    });
    expect(done.brief.provenance.inputHashes.brief).toBeUndefined();
    expect(done.content.provenance.inputHashes.brief).toMatch(/^[0-9a-f]{64}$/);
    expect(done.content.title).toBe(done.brief.title);
  });
});

describe('canonicalJson', () => {
  it('sorts the keys at every depth and drops the whitespace', () => {
    expect(canonicalJson({ b: [{ d: 1, c: 2 }], a: 'x' })).toBe('{"a":"x","b":[{"c":2,"d":1}]}');
  });
});

describe('applyEdits', () => {
  it('sets and deletes at dotted paths, and reports a path that does not exist', () => {
    const draft = { brief: { targets: [{ id: 'a' }, { id: 'b' }] }, content: { steps: [1, 2, 3] } };
    const problems = applyEdits(draft, [
      { file: 'brief', path: 'targets.1.id', value: 'c' },
      { file: 'content', path: 'steps.0', delete: true },
      { file: 'brief', path: 'nothing.here.at.all', value: 1 },
    ]);
    expect(draft).toEqual({
      brief: { targets: [{ id: 'a' }, { id: 'c' }] },
      content: { steps: [2, 3] },
    });
    expect(problems).toEqual(['brief.nothing.here.at.all: the path does not exist']);
  });
});
