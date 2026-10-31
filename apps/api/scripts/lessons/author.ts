/**
 * Writes the lessons of one level unattended (#83). For each outline entry
 * that has no files yet:
 *
 *   the model writes the lesson ─→ complete + validateLesson (check-draft.ts) ─→ ok: write the files
 *          ▲                                                    │
 *          └──────────── the issues, same conversation ─────────┘  at most --attempts times
 *
 * Each lesson is written as soon as it passes, so an interrupted run loses
 * only the lessons in progress. An existing file is never touched: to redo
 * a lesson, delete its files. The /author-lessons skill does the same in a
 * Claude Code session, with lessons:check; see docs/LESSONS.md section 7.
 *
 *   pnpm --filter @ft/api lessons:author fr a1
 *   pnpm --filter @ft/api lessons:author fr a1 --kind grammar --max 3
 *   pnpm --filter @ft/api lessons:author fr a1 --only fr-subject-pronouns --model opus
 *   pnpm --filter @ft/api lessons:author fr a1 --provider deepseek   (needs DEEPSEEK_API_KEY)
 */
import { parseArgs } from 'node:util';

import {
  foldText,
  LanguageSchema,
  LessonKindSchema,
  LevelSchema,
  type LessonOutlineEntry,
  type LessonOutlineFile,
} from '@ft/shared';

import { checkDraft, type Issue } from './check-draft';
import type { Draft } from './complete';
import {
  filesOf,
  readOutline,
  readUsedTitles,
  writeLesson,
  writeWork,
  type Located,
} from './files';
import { issuesPrompt, lessonPrompt, PROMPT_VERSION } from './prompt';
import { QuotaError, type Provider } from './providers/chat';
import { claudeProvider } from './providers/claude';
import { deepseekProvider } from './providers/deepseek';
import { applyReply } from './reply';
import {
  addUsage,
  newRun,
  printProgress,
  printSummary,
  saveReport,
  type LessonRun,
} from './report';

const USAGE = `Usage: lessons:author <fr|de|en> <a1|a2|b1|b2|c1|c2> [options]
  --provider <claude|deepseek>  claude (default): Claude Code on your subscription; deepseek: paid, DEEPSEEK_API_KEY
  --kind <kind>                 only this kind
  --only <id,id…>               only these lessons
  --max <n>                     stop after n lessons (to spread a quota over several days)
  --concurrency <n>             lessons written at the same time (default 2)
  --model <model>               claude: sonnet (default), opus, haiku or an id; deepseek: deepseek-chat (default)
  --effort <level>              claude only: low, medium, high, xhigh or max
  --attempts <n>                replies per lesson, the first included (default 4)
  --timeout <minutes>           per reply (default 15)
  --claude-bin <path>           the claude binary, when it is not found on its own`;

/** The command line, checked: an unknown option or a missing value is an error, not ignored. */
function readOptions() {
  const { values: v, positionals } = parseArgs({
    allowPositionals: true,
    strict: true,
    // Every option takes a value: the ones USAGE lists.
    options: Object.fromEntries(
      'provider kind only max concurrency model effort attempts timeout claude-bin'
        .split(' ')
        .map((name) => [name, { type: 'string' as const }]),
    ),
  });
  const lang = LanguageSchema.safeParse(positionals[0]);
  const level = LevelSchema.safeParse(positionals[1]?.toUpperCase());
  const kind = v.kind === undefined ? undefined : LessonKindSchema.safeParse(v.kind);
  const provider = v.provider ?? 'claude';
  if (!lang.success || !level.success || kind?.success === false || positionals.length !== 2)
    throw new Error(USAGE);
  if (provider !== 'claude' && provider !== 'deepseek')
    throw new Error(`--provider must be claude or deepseek, not ${provider}`);
  if (provider === 'deepseek' && v.effort)
    throw new Error('--effort works with --provider claude only');

  /** A whole number above 0, or `fallback` when the option is not given. */
  const whole = (name: string, fallback: number) => {
    const raw = v[name];
    const n = raw === undefined ? fallback : Number(raw);
    if (!Number.isInteger(n) || n < 1)
      throw new Error(`--${name} expects a whole number above 0, not ${raw}`);
    return n;
  };
  return {
    lang: lang.data,
    level: level.data,
    provider,
    kind: kind?.data,
    only: v.only?.split(',').map((s) => s.trim()),
    max: v.max === undefined ? Infinity : whole('max', 1),
    concurrency: whole('concurrency', 2),
    model: v.model ?? (provider === 'deepseek' ? 'deepseek-chat' : 'sonnet'),
    effort: v.effort,
    attempts: whole('attempts', 4),
    timeoutMs: whole('timeout', 15) * 60_000,
    claudeBin: v['claude-bin'],
  };
}
type Options = ReturnType<typeof readOptions>;

/** The provider the options name. DeepSeek is used only when asked for, and needs its own key. */
function makeProvider(o: Options): Provider {
  if (o.provider === 'claude')
    return claudeProvider({
      model: o.model,
      effort: o.effort,
      bin: o.claudeBin,
      timeoutMs: o.timeoutMs,
    });
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey)
    throw new Error('--provider deepseek needs DEEPSEEK_API_KEY in .env (see .env.example)');
  return deepseekProvider({ apiKey, model: o.model, timeoutMs: o.timeoutMs });
}

/** The entries to write: no files yet, and matching --kind, --only and --max. Warns about the rest. */
function pickLessons(outline: LessonOutlineFile, o: Options): LessonOutlineEntry[] {
  for (const e of outline.entries)
    if (filesOf(e) === 'partial')
      console.warn(`! ${e.id}: only one of its files exists, left as it is`);
  const todo = outline.entries
    .filter((e) => filesOf(e) === 'none')
    .filter((e) => !o.kind || e.kind === o.kind)
    .filter((e) => !o.only || o.only.includes(e.id))
    .slice(0, o.max);
  for (const id of o.only ?? [])
    if (!todo.some((e) => e.id === id))
      console.warn(`! ${id}: not in this outline, or already written`);
  return todo;
}

/** What every lesson of the run shares. */
interface RunState {
  provider: Provider;
  outline: LessonOutlineFile;
  attempts: number;
  usedTitles: ReturnType<typeof readUsedTitles>;
  /** Set by the first QuotaError: every lesson stops after its current reply. */
  stop?: string;
}

/**
 * Writes one lesson: asks the model, completes and checks its reply, and
 * sends the issues back until the lesson passes or the attempts run out.
 * A lesson that fails leaves its last draft and issues in WORK_DIR/failed.
 */
async function authorLesson(at: Located, s: RunState): Promise<LessonRun> {
  const { entry } = at;
  const run = newRun(entry);
  const started = Date.now();
  const ctx = { ...at, model: s.provider.model, promptVersion: PROMPT_VERSION };
  const chat = s.provider.startChat(entry.kind);
  const titles = [...s.usedTitles.values()].map((t) => t.title);
  let prompt = lessonPrompt({ ...at, outline: s.outline, usedTitles: titles });
  let draft: Draft = { brief: {} };
  let issues: Issue[] = [];

  try {
    while (run.attempts < s.attempts && !s.stop) {
      run.attempts++;
      const reply = await chat.send(prompt);
      addUsage(run, reply);

      const read = applyReply(draft, reply.text);
      if ('error' in read) {
        issues = [{ path: '', message: read.error }];
        prompt = issuesPrompt(issues, []);
        continue;
      }
      const check = checkDraft(draft, ctx, s.usedTitles);
      draft = check.completed;
      issues = check.issues;
      // A failed edit is sent back even when the lesson passes: the model meant something else.
      if (check.files && read.editProblems.length === 0) {
        // No await between the title check and this line: two lessons cannot take one title.
        s.usedTitles.set(foldText(check.files.title), { title: check.files.title, id: entry.id });
        await writeLesson(entry.id, check.files.brief, check.files.content);
        run.outcome = 'written';
        return run;
      }
      prompt = issuesPrompt(issues, read.editProblems);
    }
    if (s.stop && run.attempts < s.attempts) run.outcome = 'quota';
    run.issues = issues.map((i) => `${i.path}: ${i.message}`);
    writeWork(`failed/${entry.id}.json`, JSON.stringify({ issues: run.issues, ...draft }, null, 2));
    return run;
  } catch (e) {
    if (e instanceof QuotaError) s.stop ??= e.message;
    run.outcome = e instanceof QuotaError ? 'quota' : 'error';
    run.error = (e as Error).message;
    return run;
  } finally {
    run.seconds = Math.round((Date.now() - started) / 1000);
  }
}

/**
 * Runs `work` on the items, `concurrency` at a time, until they are done or
 * `stopped()`. Returns how many items were never started.
 */
async function pool<T>(
  items: T[],
  concurrency: number,
  work: (item: T) => Promise<void>,
  stopped: () => boolean,
) {
  const queue = [...items];
  const worker = async () => {
    // Checked before taking an item, so a stop leaves the rest counted in the queue.
    while (queue.length && !stopped()) await work(queue.shift()!);
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return queue.length;
}

async function main() {
  const o = readOptions();
  const outline = readOutline(o.lang, o.level);
  const todo = pickLessons(outline, o);
  if (todo.length === 0)
    return console.log('Nothing to write: every selected lesson already has its files.');

  const s: RunState = {
    provider: makeProvider(o),
    outline,
    attempts: o.attempts,
    usedTitles: readUsedTitles(o.lang),
  };
  const label = `${o.lang} ${o.level}`;
  console.log(
    `Writing ${todo.length} ${label} lesson${todo.length === 1 ? '' : 's'} with ${o.model} (${o.provider})` +
      `${o.effort ? `, effort ${o.effort}` : ''}, ${o.concurrency} at a time, ${o.attempts} attempts each.\n` +
      `${s.provider.where}\n`,
  );

  const runs: LessonRun[] = [];
  const started = Date.now();
  const notStarted = await pool(
    todo,
    o.concurrency,
    async (entry) => {
      const run = await authorLesson({ entry, lang: o.lang, level: o.level }, s);
      runs.push(run);
      printProgress(run, runs.length, todo.length);
    },
    () => s.stop !== undefined,
  );

  const summary = {
    runs,
    notStarted,
    wallSeconds: Math.round((Date.now() - started) / 1000),
    concurrency: o.concurrency,
    provider: s.provider,
    remaining: outline.entries.filter((e) => filesOf(e) !== 'complete').length,
    label,
    stop: s.stop,
  };
  printSummary(summary);
  console.log(
    `Report: ${saveReport(summary, { lang: o.lang, level: o.level, effort: o.effort, attempts: o.attempts })}`,
  );
  if (runs.some((r) => r.outcome !== 'written') || notStarted || s.stop) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
