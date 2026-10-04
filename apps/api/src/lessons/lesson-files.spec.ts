import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  COMPLETE_LANGUAGES,
  foldText,
  LessonDraftFileSchema,
  lessonFileName,
  LessonOutlineFileSchema,
  LEVELS,
  outlineFileName,
} from '@ft/shared';

/**
 * Validates the written lessons in content/lessons against their outlines in
 * content/outlines. Built like apps/api/src/items/item-files.spec.ts, and for
 * the same reasons.
 *
 * Passes with no file at all: a language is written one level at a time, and
 * only one in COMPLETE_LANGUAGES must have all six.
 */

// vitest runs with the package as cwd.
const CONTENT_DIR = join(process.cwd(), '../..', 'content');
const LESSONS_DIR = join(CONTENT_DIR, 'lessons');
const OUTLINES_DIR = join(CONTENT_DIR, 'outlines');

function read(dir: string, name: string): unknown {
  try {
    return JSON.parse(readFileSync(join(dir, name), 'utf8'));
  } catch (error) {
    throw new Error(`${name} is not valid JSON: ${(error as Error).message}`, { cause: error });
  }
}

/** `drafts.12 (fr-greetings).brief.points: ...`, so an author can find the line to fix. */
function describeIssues(raw: unknown, issues: { path: PropertyKey[]; message: string }[]): string {
  const drafts = (raw as { drafts?: { id?: unknown }[] } | null)?.drafts;
  return issues
    .map(({ path, message }) => {
      const [key, index, ...rest] = path;
      const id = key === 'drafts' && typeof index === 'number' ? drafts?.[index]?.id : undefined;
      const where =
        typeof id === 'string'
          ? [`${String(key)}.${String(index)} (${id})`, ...rest.map(String)].join('.')
          : path.map(String).join('.');
      return `  ${where}: ${message}`;
    })
    .join('\n');
}

const files = readdirSync(LESSONS_DIR)
  .filter((name) => name.endsWith('.json'))
  .sort();
const raws = new Map(files.map((name) => [name, read(LESSONS_DIR, name)]));
const parsed = new Map(
  files.map((name) => [name, LessonDraftFileSchema.safeParse(raws.get(name))]),
);

describe('content/lessons', () => {
  describe.each(files)('%s', (name) => {
    const result = parsed.get(name)!;
    const file = result.success ? result.data : undefined;

    it('matches the lesson file schema', () => {
      const issues = result.success ? '' : describeIssues(raws.get(name), result.error.issues);
      expect(issues, `${name} is not a valid lesson file:\n${issues}\n`).toBe('');
    });

    it('is named after the language and level it declares', () => {
      if (!file) return;
      expect(name).toBe(lessonFileName(file.lang, file.level));
    });

    // The outline is the plan: the generator writes each lesson from its entry,
    // and the seed takes the position from the order, so the two must not drift.
    it('follows its outline: same ids, same order, same classification', () => {
      if (!file) return;
      const outlineName = outlineFileName(file.lang, file.level);
      expect(
        existsSync(join(OUTLINES_DIR, outlineName)),
        `lessons/${name} has no outlines/${outlineName}`,
      ).toBe(true);

      const outline = LessonOutlineFileSchema.safeParse(read(OUTLINES_DIR, outlineName));
      expect(outline.success, `outlines/${outlineName} is not a valid outline file`).toBe(true);
      if (!outline.success) return;

      const entries = outline.data.entries;
      const mismatches: string[] = [];
      for (let i = 0; i < Math.max(entries.length, file.drafts.length); i++) {
        const planned = entries[i];
        const lesson = file.drafts[i];
        if (!planned || !lesson) {
          mismatches.push(
            `drafts.${i}: ${lesson ? `${lesson.id} is not in the outline` : `${planned!.id} is missing`}`,
          );
          continue;
        }
        const differs = (['id', 'kind', 'topic', 'theme'] as const).filter(
          (key) => planned[key] !== lesson[key],
        );
        if (differs.length > 0) {
          mismatches.push(
            `drafts.${i} (${lesson.id}): ${differs
              .map(
                (key) =>
                  `${key} is ${lesson[key] ?? 'absent'}, outline has ${planned[key] ?? 'absent'}`,
              )
              .join(', ')}`,
          );
        }
      }
      expect(mismatches, `lessons/${name} does not follow outlines/${outlineName}`).toEqual([]);
    });
  });

  // The search and the generator's clash check compare titles folded, so two
  // titles that fold the same would be the same lesson to a learner.
  it('has no title used twice within a language, after folding', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];

    for (const [name, result] of parsed) {
      if (!result.success) continue;
      for (const lesson of result.data.drafts) {
        const key = `${result.data.lang}:${foldText(lesson.title)}`;
        const where = `${name} ${lesson.id}`;
        const previous = seen.get(key);
        if (previous !== undefined) {
          clashes.push(`"${lesson.title}" in both ${previous} and ${where}`);
        }
        seen.set(key, where);
      }
    }

    expect(clashes).toEqual([]);
  });

  it('has all six levels of every complete language', () => {
    const missing = COMPLETE_LANGUAGES.flatMap((lang) =>
      LEVELS.map((level) => lessonFileName(lang, level)).filter((name) => !files.includes(name)),
    );
    expect(missing).toEqual([]);
  });
});
