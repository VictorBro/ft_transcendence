import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  KIND_COUNTS,
  LESSON_KINDS,
  LESSONS_PER_LEVEL,
  LessonOutlineFileSchema,
  outlineFileName,
} from '@ft/shared';

/**
 * Validates the lesson outlines in content/outlines: one file per language and
 * level, the plan the generator writes the lessons from. Built like
 * apps/api/src/items/item-files.spec.ts, and for the same reasons.
 *
 * Passes with no file at all: the outlines arrive one language at a time.
 */

// vitest runs with the package as cwd.
const OUTLINES_DIR = join(process.cwd(), '../..', 'content/outlines');

function read(name: string): unknown {
  try {
    return JSON.parse(readFileSync(join(OUTLINES_DIR, name), 'utf8'));
  } catch (error) {
    throw new Error(`${name} is not valid JSON: ${(error as Error).message}`, { cause: error });
  }
}

/** `entries.12 (fr-greetings).theme: ...`, so an author can find the line to fix. */
function describeIssues(raw: unknown, issues: { path: PropertyKey[]; message: string }[]): string {
  const entries = (raw as { entries?: { id?: unknown }[] } | null)?.entries;
  return issues
    .map(({ path, message }) => {
      const [key, index, ...rest] = path;
      const id = key === 'entries' && typeof index === 'number' ? entries?.[index]?.id : undefined;
      const where =
        typeof id === 'string'
          ? [`${String(key)}.${String(index)} (${id})`, ...rest.map(String)].join('.')
          : path.map(String).join('.');
      return `  ${where}: ${message}`;
    })
    .join('\n');
}

const files = readdirSync(OUTLINES_DIR)
  .filter((name) => name.endsWith('.json'))
  .sort();
const raws = new Map(files.map((name) => [name, read(name)]));
const parsed = new Map(
  files.map((name) => [name, LessonOutlineFileSchema.safeParse(raws.get(name))]),
);

describe('content/outlines', () => {
  describe.each(files)('%s', (name) => {
    const result = parsed.get(name)!;
    const outline = result.success ? result.data : undefined;

    it('matches the outline file schema', () => {
      const issues = result.success ? '' : describeIssues(raws.get(name), result.error.issues);
      expect(issues, `${name} is not a valid outline file:\n${issues}\n`).toBe('');
    });

    it('is named after the language and level it declares', () => {
      if (!outline) return;
      expect(name).toBe(outlineFileName(outline.lang, outline.level));
    });

    it('has exactly as many entries as its level has lessons', () => {
      if (!outline) return;
      expect(outline.entries.length, name).toBe(LESSONS_PER_LEVEL[outline.level]);
    });

    it('has exactly as many lessons of each kind as its language and level plan', () => {
      if (!outline) return;
      const offenders = LESSON_KINDS.flatMap((kind) => {
        const count = outline.entries.filter((entry) => entry.kind === kind).length;
        const expected = KIND_COUNTS[outline.lang][outline.level][kind];
        return count === expected ? [] : [`${kind}: ${count}, expected ${expected}`];
      });
      expect(offenders, name).toEqual([]);
    });

    // Spec fixtures use `<lang>-test-` ids and delete them after each run (#79),
    // so an authored lesson with that prefix would be wiped with them.
    it('uses no id with the reserved <lang>-test- prefix', () => {
      if (!outline) return;
      const reserved = outline.entries
        .map((entry) => entry.id)
        .filter((id) => id.startsWith(`${outline.lang}-test-`));
      expect(reserved, name).toEqual([]);
    });
  });

  // Ids are permanent: Lesson's primary key, and what results point at. A level
  // can move a lesson to another file, never give its id to a second one.
  it('has no id used twice within a language', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];

    for (const [name, result] of parsed) {
      if (!result.success) continue;
      for (const entry of result.data.entries) {
        const previous = seen.get(entry.id);
        if (previous !== undefined && previous !== name) {
          clashes.push(`${entry.id} in both ${previous} and ${name}`);
        }
        seen.set(entry.id, name);
      }
    }

    expect(clashes).toEqual([]);
  });
});
