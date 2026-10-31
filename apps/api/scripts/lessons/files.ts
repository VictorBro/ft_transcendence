/**
 * Where the lessons live, and the few reads and writes the authoring kit
 * (#83) does there:
 *
 *   content/outlines/<lang>-<level>.json   what to write (read)
 *   content/briefs/<id>.json               every lesson's brief (written)
 *   content/lessons/<id>.json              the content file, all kinds but vocabulary (written)
 *   $TMPDIR/ft-lessons-author/             prompts, failed drafts, run reports
 *
 * An existing lesson file is never overwritten: to redo a lesson, delete its files.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  foldText,
  LanguageSchema,
  LessonOutlineFileSchema,
  LEVELS,
  lessons,
  outlineFileName,
  type Language,
  type LessonOutlineEntry,
  type LessonOutlineFile,
  type Level,
} from '@ft/shared';
import { format, resolveConfig } from 'prettier';

// pnpm --filter runs the scripts from apps/api, as vitest does.
const CONTENT_DIR = resolve(process.cwd(), '../../content');
export const BRIEFS_DIR = join(CONTENT_DIR, 'briefs');
export const LESSONS_DIR = join(CONTENT_DIR, 'lessons');

/** Outside the repo: what the kit keeps between runs but nobody commits. */
export const WORK_DIR = join(tmpdir(), 'ft-lessons-author');

/** The outline entry's place: where its files go and what checks them. */
export interface Located {
  entry: LessonOutlineEntry;
  lang: Language;
  level: Level;
}

export const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

/** Writes `text` under WORK_DIR, creating the folders; returns the full path. */
export function writeWork(name: string, text: string): string {
  const path = join(WORK_DIR, name);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
  return path;
}

/** One level's outline, checked by its schema. */
export function readOutline(lang: Language, level: Level): LessonOutlineFile {
  return LessonOutlineFileSchema.parse(
    readJson(join(CONTENT_DIR, 'outlines', outlineFileName(lang, level))),
  );
}

/** Finds a lesson id in its language's six outlines: fr-greetings → fr, its level, its entry. */
export function locate(id: string): Located | undefined {
  const lang = LanguageSchema.safeParse(id.split('-')[0]);
  if (!lang.success) return undefined;
  for (const level of LEVELS) {
    const entry = readOutline(lang.data, level).entries.find((e) => e.id === id);
    if (entry) return { entry, lang: lang.data, level };
  }
  return undefined;
}

/**
 * Which of a lesson's files exist. "partial" is a half-written lesson (a
 * brief without its content file, or the reverse) or a vocabulary lesson
 * with a content file it should not have: the kit leaves those alone.
 */
export function filesOf(entry: LessonOutlineEntry): 'none' | 'partial' | 'complete' {
  const brief = existsSync(join(BRIEFS_DIR, `${entry.id}.json`));
  const content = existsSync(join(LESSONS_DIR, `${entry.id}.json`));
  if (!lessons.hasContentFile(entry.kind)) return content ? 'partial' : brief ? 'complete' : 'none';
  return brief && content ? 'complete' : brief || content ? 'partial' : 'none';
}

/**
 * The titles already written in a language, any level, folded so that
 * case and accents do not hide a duplicate: folded title → { title, id }.
 */
export function readUsedTitles(lang: Language): Map<string, { title: string; id: string }> {
  const used = new Map<string, { title: string; id: string }>();
  for (const file of readdirSync(BRIEFS_DIR)) {
    if (!file.startsWith(`${lang}-`) || !file.endsWith('.json')) continue;
    const title = (readJson(join(BRIEFS_DIR, file)) as { title?: unknown }).title;
    if (typeof title === 'string')
      used.set(foldText(title), { title, id: file.slice(0, -'.json'.length) });
  }
  return used;
}

/** Writes a lesson's files, formatted the way prettier formats the rest of content/. */
export async function writeLesson(id: string, brief: unknown, content: unknown): Promise<string[]> {
  const options = { ...(await resolveConfig(join(BRIEFS_DIR, `${id}.json`))), parser: 'json' };
  const written: string[] = [];
  for (const [dir, file] of [
    [BRIEFS_DIR, brief],
    [LESSONS_DIR, content],
  ] as const) {
    if (file === null || file === undefined) continue;
    const path = join(dir, `${id}.json`);
    writeFileSync(path, await format(JSON.stringify(file), options));
    written.push(path);
  }
  return written;
}
