/**
 * Checks one language's six outlines while they are being written: what
 * outline-files.spec.ts checks, plus the house style the spec leaves to
 * reviewers. --level reports only problems that name that level's file, so
 * several people or agents can each fix one file while the others are half done.
 *
 *   pnpm --filter @ft/api outlines:check de
 *   pnpm --filter @ft/api outlines:check de --level B1 --dir /abs/path/to/plan
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  foldText,
  KIND_COUNTS,
  LEARNABLE_LANGUAGES,
  LESSON_KINDS,
  LESSONS_PER_LEVEL,
  LEVELS,
  LanguageSchema,
  LessonOutlineFileSchema,
  LevelSchema,
  outlineFileName,
} from '@ft/shared';

const USAGE = `Usage: outlines:check <${LEARNABLE_LANGUAGES.join('|')}> [--level <${LEVELS.join('|')}>] [--dir <absolute path>]`;

// Typographic quotes a language may keep: French intents quote with « ».
const ALLOWED_QUOTES: Partial<Record<string, string>> = { fr: '«»' };
const QUOTES = '"‘’‚“”„«»';

function option(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
}

function main() {
  const lang = LanguageSchema.safeParse(process.argv[2]);
  const level = option('--level');
  const onlyLevel = level === undefined ? undefined : LevelSchema.safeParse(level.toUpperCase());
  if (!lang.success || onlyLevel?.success === false) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  // pnpm --filter runs from apps/api, as vitest does.
  const dir = resolve(option('--dir') ?? join(process.cwd(), '../../content/outlines'));
  const allowed = ALLOWED_QUOTES[lang.data] ?? '';
  const banned = new RegExp(`[${[...QUOTES].filter((q) => !allowed.includes(q)).join('')}]`);

  const problems: string[] = [];
  const ids = new Map<string, string>();
  const titles = new Map<string, string>();

  for (const lvl of LEVELS) {
    const name = outlineFileName(lang.data, lvl);
    const path = join(dir, name);
    if (!existsSync(path)) {
      problems.push(`${name}: missing`);
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      problems.push(`${name}: not valid JSON: ${(error as Error).message}`);
      continue;
    }

    const parsed = LessonOutlineFileSchema.safeParse(raw);
    if (!parsed.success) {
      const entries = (raw as { entries?: { id?: string }[] }).entries;
      for (const issue of parsed.error.issues) {
        const [key, index, ...rest] = issue.path;
        const id =
          key === 'entries' && typeof index === 'number' ? entries?.[index]?.id : undefined;
        const where =
          id === undefined
            ? issue.path.join('.')
            : [`#${Number(index) + 1} ${id}`, ...rest].join('.');
        problems.push(`${name} ${where}: ${issue.message}`);
      }
      continue;
    }
    const { entries } = parsed.data;
    if (parsed.data.lang !== lang.data || parsed.data.level !== lvl) {
      problems.push(`${name}: declares ${parsed.data.lang} ${parsed.data.level}`);
    }

    if (entries.length !== LESSONS_PER_LEVEL[lvl]) {
      problems.push(`${name}: ${entries.length} entries, expected ${LESSONS_PER_LEVEL[lvl]}`);
    }
    for (const kind of LESSON_KINDS) {
      const count = entries.filter((entry) => entry.kind === kind).length;
      const expected = KIND_COUNTS[lang.data][lvl][kind];
      if (count !== expected) problems.push(`${name}: ${kind} ${count}, expected ${expected}`);
    }

    entries.forEach((entry, index) => {
      const at = `${name} #${index + 1} ${entry.id}`;
      // The files stay diffable when every entry lists its keys the same way.
      const order = [
        'id',
        'kind',
        entry.kind === 'grammar' ? 'topic' : 'theme',
        'workingTitle',
        'intent',
      ];
      const rawEntry = (raw as { entries: Record<string, unknown>[] }).entries[index];
      if (Object.keys(rawEntry).join() !== order.join()) {
        problems.push(`${at}: keys must be ${order.join(', ')}`);
      }
      // A lesson can move level and keep its id (LESSONS.md section 5).
      if (/(^|-)[abc][12](-|$)/.test(entry.id)) problems.push(`${at}: id names a level`);

      for (const field of ['workingTitle', 'intent'] as const) {
        const text = entry[field];
        if (/[–—]/.test(text)) problems.push(`${at}: ${field} has an en or em dash`);
        if (banned.test(text)) problems.push(`${at}: ${field} has quotation marks`);
        if (/\s{2}/.test(text)) problems.push(`${at}: ${field} has a double space`);
      }

      const previousId = ids.get(entry.id);
      if (previousId !== undefined) problems.push(`${at}: id also at ${previousId}`);
      ids.set(entry.id, `${name} #${index + 1}`);

      const title = foldText(entry.workingTitle);
      const previousTitle = titles.get(title);
      if (previousTitle !== undefined) {
        problems.push(`${at}: title "${entry.workingTitle}" also at ${previousTitle}`);
      }
      titles.set(title, `${name} #${index + 1}`);
    });
  }

  const mine = onlyLevel?.success ? outlineFileName(lang.data, onlyLevel.data) : undefined;
  const shown = mine === undefined ? problems : problems.filter((p) => p.includes(mine));
  if (shown.length > 0) {
    console.log(shown.join('\n'));
    console.log(`\n${shown.length} problem(s)`);
    process.exitCode = 1;
    return;
  }
  console.log('ok');
}

main();
