/**
 * Checks one lesson (#83): runs complete and validateLesson on it and
 * prints every issue. It is the loop of the /author-lessons skill, and works
 * the same for a member writing with any model by hand.
 *
 *   pnpm --filter @ft/api lessons:check <id> --rules              the prompt lessons:author would send
 *   pnpm --filter @ft/api lessons:check <id> --draft <file>       checks a draft: {"brief":…,"content":…}
 *   pnpm --filter @ft/api lessons:check <id> --draft <file> --write   …and writes it to content/ when valid
 *   pnpm --filter @ft/api lessons:check <id>                      checks the lesson's committed files
 *
 * A draft with a brief only is checked as a brief: the missing content file
 * is not an issue yet. Exit code 1 when anything is left to fix.
 *
 * --draft is read from the folder the command was typed in (INIT_CWD, set
 * by pnpm), not from apps/api where pnpm runs the script.
 *
 * On committed files, complete runs before validateLesson as on a draft, so
 * it recomputes every duration: a committed file with wrong durations passes
 * here. lesson-files.spec.ts checks the files as they are, and catches it.
 */
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { lessons } from '@ft/shared';

import { checkDraft } from './check-draft';
import type { Draft } from './complete';
import {
  BRIEFS_DIR,
  filesOf,
  LESSONS_DIR,
  locate,
  readJson,
  readOutline,
  readUsedTitles,
  writeLesson,
} from './files';
import { isObject } from './json';
import { lessonPrompt, PROMPT_VERSION, systemPrompt } from './prompt';

const USAGE =
  'Usage: lessons:check <id> [--rules] [--draft <file> [--write]] [--model <name, default claude-code>]';

/** The lesson to check: the draft file, else the files already in content/. */
function readDraft(id: string, draftPath: string | undefined): Draft {
  if (draftPath) {
    // pnpm runs the script from apps/api; INIT_CWD is where the member typed the command.
    const draft = readJson(resolve(process.env.INIT_CWD ?? process.cwd(), draftPath));
    if (!isObject(draft) || !isObject(draft.brief))
      throw new Error(`${draftPath}: expected {"brief":{…},"content":{…}}`);
    return { brief: draft.brief, content: draft.content };
  }
  const at = locate(id)!;
  if (filesOf(at.entry) === 'none') throw new Error(`${id} has no files yet: pass --draft <file>`);
  const content = lessons.hasContentFile(at.entry.kind)
    ? readJson(join(LESSONS_DIR, `${id}.json`))
    : undefined;
  return { brief: readJson(join(BRIEFS_DIR, `${id}.json`)), content };
}

async function main() {
  const { values: v, positionals } = parseArgs({
    allowPositionals: true,
    strict: true,
    options: {
      rules: { type: 'boolean' },
      draft: { type: 'string' },
      write: { type: 'boolean' },
      model: { type: 'string' },
    },
  });
  const id = positionals[0];
  if (positionals.length !== 1 || (v.write && !v.draft)) throw new Error(USAGE);
  const at = locate(id);
  if (!at) throw new Error(`${id}: in no outline of content/outlines`);

  if (v.rules) {
    const titles = [...readUsedTitles(at.lang).values()].map((t) => t.title);
    console.log(systemPrompt(at.entry.kind));
    console.log(
      `\n# The lesson to write\n\n${lessonPrompt({ ...at, outline: readOutline(at.lang, at.level), usedTitles: titles })}`,
    );
    return;
  }

  const draft = readDraft(id, v.draft);
  const briefOnly = lessons.hasContentFile(at.entry.kind) && draft.content === undefined;
  // Functions and reading take their minutes from the content: until it exists,
  // a placeholder lets the rest of the brief be checked.
  if (briefOnly && isObject(draft.brief)) draft.brief.estimatedMinutes ??= 1;
  const ctx = { ...at, model: v.model ?? 'claude-code', promptVersion: PROMPT_VERSION };
  const check = checkDraft(draft, ctx, readUsedTitles(at.lang));
  // validateLesson names a missing content file at the path "content"; at the brief stage it is expected.
  const issues = briefOnly ? check.issues.filter((i) => i.path !== 'content') : check.issues;

  for (const i of issues) console.log(`- ${i.path}: ${i.message}`);
  if (issues.length) {
    process.exitCode = 1;
    return console.log(`\n${issues.length} issue${issues.length === 1 ? '' : 's'} in ${id}`);
  }
  if (briefOnly) return console.log(`${id}: the brief passes; write the content next`);
  console.log(`${id}: ok`);

  if (v.write) {
    if (filesOf(at.entry) !== 'none')
      throw new Error(`${id} already has files: delete them first to redo the lesson`);
    for (const path of await writeLesson(id, check.files!.brief, check.files!.content))
      console.log(`wrote ${path}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
