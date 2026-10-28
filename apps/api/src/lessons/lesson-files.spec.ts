import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { foldText, LessonOutlineFileSchema, lessons } from '@ft/shared';

/**
 * Validates the written lessons against their outline entries:
 *
 *   content/briefs/<id>.json    every kind
 *   content/lessons/<id>.json   every kind but vocabulary, whose lesson is its brief
 *
 * Each lesson goes through validateLesson, the check the seed runs, so a
 * lesson that passes here also seeds. Built like
 * apps/api/src/items/item-files.spec.ts, and for the same reasons.
 *
 * A level is written lesson by lesson, from its first entry: the lessons
 * with files, the ready ones, are always its first entries by position, with
 * no gap. So the proposal and the level progress, which read ready lessons
 * only, never skip one that is still to be written.
 */

// vitest runs with the package as cwd.
const CONTENT_DIR = join(process.cwd(), '../..', 'content');
const OUTLINES_DIR = join(CONTENT_DIR, 'outlines');
const BRIEFS_DIR = join(CONTENT_DIR, 'briefs');
const LESSONS_DIR = join(CONTENT_DIR, 'lessons');

function read(dir: string, name: string): unknown {
  try {
    return JSON.parse(readFileSync(join(dir, name), 'utf8'));
  } catch (error) {
    throw new Error(`${name} is not valid JSON: ${(error as Error).message}`, { cause: error });
  }
}

/** The ids of a folder's lesson files: `fr-greetings.json` → `fr-greetings`. */
const idsIn = (dir: string) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => name.endsWith('.json'))
        .map((name) => name.slice(0, -'.json'.length))
        .sort()
    : [];

// The outlines are checked by outline-files.spec.ts; an invalid one is skipped here.
const contexts = new Map<string, lessons.OutlineContext>();
/** Each outline file's entries in position order, by file name. */
const levels = new Map<string, lessons.OutlineContext['entry'][]>();
for (const name of readdirSync(OUTLINES_DIR).filter((n) => n.endsWith('.json'))) {
  const outline = LessonOutlineFileSchema.safeParse(read(OUTLINES_DIR, name));
  if (!outline.success) continue;
  levels.set(name, outline.data.entries);
  for (const entry of outline.data.entries)
    contexts.set(entry.id, { entry, lang: outline.data.lang, level: outline.data.level });
}

const briefIds = idsIn(BRIEFS_DIR);
const contentIds = idsIn(LESSONS_DIR);

const results = new Map(
  briefIds
    .filter((id) => contexts.has(id))
    .map((id) => [
      id,
      lessons.validateLesson(
        read(BRIEFS_DIR, `${id}.json`),
        contentIds.includes(id) ? read(LESSONS_DIR, `${id}.json`) : undefined,
        contexts.get(id)!,
      ),
    ]),
);

describe('content/briefs and content/lessons', () => {
  describe.each(briefIds)('%s', (id) => {
    it('has an outline entry', () => {
      expect(contexts.has(id), `briefs/${id}.json has no entry in content/outlines`).toBe(true);
    });

    it('passes validateLesson', () => {
      const result = results.get(id);
      if (!result) return;
      const issues = result.ok
        ? ''
        : result.issues.map(({ path, message }) => `  ${path}: ${message}`).join('\n');
      expect(issues, `${id} is not a valid lesson:\n${issues}\n`).toBe('');
    });
  });

  it('has a brief and an outline entry for every content file', () => {
    const strays = contentIds.filter((id) => !briefIds.includes(id) || !contexts.has(id));
    expect(strays.map((id) => `lessons/${id}.json`)).toEqual([]);
  });

  // The search compares titles folded, so two titles that fold the same
  // would be the same lesson to a learner.
  it('has no title used twice within a language, after folding', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const [id, result] of results) {
      if (!result.ok) continue;
      const key = `${result.brief.lang}:${foldText(result.title)}`;
      const previous = seen.get(key);
      if (previous !== undefined) clashes.push(`"${result.title}" in both ${previous} and ${id}`);
      seen.set(key, id);
    }
    expect(clashes).toEqual([]);
  });

  // The seed's rule: a brief, plus a content file for every kind but vocabulary.
  it.each([...levels])(
    '%s: the lessons with files are its first entries, with no gap',
    (_, entries) => {
      const hasFiles = entries.map(
        (entry) =>
          briefIds.includes(entry.id) &&
          (!lessons.hasContentFile(entry.kind) || contentIds.includes(entry.id)),
      );
      const written = hasFiles.filter(Boolean).length;
      const gaps = entries
        .slice(0, written)
        .filter((_, index) => !hasFiles[index])
        .map((entry) => entry.id);
      expect(gaps, `no files, though a later entry has them: ${gaps.join(', ')}`).toEqual([]);
    },
  );
});
