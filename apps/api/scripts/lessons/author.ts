/**
 * Writes the lessons of one level with Claude Code (#83), on the member's
 * own subscription. For each outline entry that has no files yet:
 *
 *   Claude writes the lesson ─→ complete() ─→ validateLesson ─→ ok: write the files
 *          ▲                                        │
 *          └──────── the issues, same conversation ─┘  at most --attempts times
 *
 * An existing file is never touched: to redo a lesson, delete its files.
 * Each lesson is written as soon as it passes, so an interrupted run
 * loses only the lessons in progress.
 *
 *   pnpm --filter @ft/api lessons:author fr a1
 *   pnpm --filter @ft/api lessons:author fr a1 --kind grammar --max 3
 *   pnpm --filter @ft/api lessons:author fr a1 --only fr-subject-pronouns --model opus
 *
 * Options:
 *   --kind <kind>         only this kind
 *   --only <id,id…>       only these lessons
 *   --max <n>             stop after n lessons (to share a quota over several days)
 *   --concurrency <n>     lessons written at the same time (default 2)
 *   --model <model>       sonnet (default), opus, haiku, or a full model id
 *   --effort <level>      low, medium, high, xhigh or max (default: the model's)
 *   --attempts <n>        Claude answers per lesson, the first included (default 4)
 *   --timeout <minutes>   per answer (default 15)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  foldText,
  LanguageSchema,
  LESSON_KINDS,
  LessonKindSchema,
  LessonOutlineFileSchema,
  LevelSchema,
  lessons,
  outlineFileName,
  type LessonOutlineEntry,
} from '@ft/shared';
import { format, resolveConfig } from 'prettier';

import {
  askClaude,
  findClaude,
  parseReply,
  QuotaError,
  WORK_DIR,
  writeSystemPrompt,
  type ClaudeReply,
} from './claude';
import { applyEdits, complete, type Draft, type Edit, type Json } from './complete';
import { askDeepSeek, type ChatMessage } from './deepseek';
import { issuesPrompt, lessonPrompt, PROMPT_VERSION, systemPrompt } from './prompt';

const USAGE =
  'Usage: lessons:author <fr|de|en> <a1|a2|b1|b2|c1|c2> [--provider <claude|deepseek>] [--kind <kind>] [--only <id,…>] [--max <n>] ' +
  '[--concurrency <n>] [--model <model>] [--effort <level>] [--attempts <n>] [--timeout <minutes>]';

function option(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
}

function positive(name: string, fallback: number): number {
  const raw = option(name);
  const n = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(n) || n < 1)
    throw new Error(`${name} expects a whole number above 0, not ${raw}`);
  return n;
}

type Outcome = 'written' | 'failed' | 'quota' | 'error';

interface LessonRun {
  id: string;
  kind: string;
  outcome: Outcome;
  attempts: number;
  seconds: number;
  outputTokens: number;
  inputTokens: number;
  cachedTokens: number;
  costUsd: number;
  /** The issues left, for a lesson that failed. */
  issues?: string[];
  error?: string;
}

const seconds = (ms: number) => Math.round(ms / 1000);
const clock = (s: number) =>
  s >= 3600
    ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`
    : s >= 60
      ? `${Math.floor(s / 60)} min ${s % 60} s`
      : `${s} s`;
const kTokens = (n: number) => `${(n / 1000).toFixed(1)}k`;

async function main() {
  const lang = LanguageSchema.safeParse(process.argv[2]);
  const level = LevelSchema.safeParse(process.argv[3]?.toUpperCase());
  const kind =
    option('--kind') === undefined ? undefined : LessonKindSchema.safeParse(option('--kind'));
  if (!lang.success || !level.success || kind?.success === false) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  const max = option('--max') === undefined ? Infinity : positive('--max', 1);
  const concurrency = positive('--concurrency', 2);
  const attempts = positive('--attempts', 4);
  const timeoutMs = positive('--timeout', 15) * 60_000;
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim() || process.env.LLM_API_KEY?.trim();
  const providerOpt =
    option('--provider') ??
    (process.env.LLM_PROVIDER === 'deepseek' || process.env.DEEPSEEK_API_KEY?.trim()
      ? 'deepseek'
      : 'claude');
  if (providerOpt !== 'claude' && providerOpt !== 'deepseek') {
    console.error(`--provider must be "claude" or "deepseek", got "${providerOpt}"`);
    process.exitCode = 1;
    return;
  }
  const defaultModel =
    providerOpt === 'deepseek' ? process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat' : 'sonnet';
  const model = option('--model') ?? defaultModel;
  const effort = option('--effort');
  const only = option('--only')
    ?.split(',')
    .map((s) => s.trim());

  // pnpm --filter runs from apps/api, as vitest does.
  const contentDir = resolve(process.cwd(), '../../content');
  const briefsDir = join(contentDir, 'briefs');
  const lessonsDir = join(contentDir, 'lessons');
  const outline = LessonOutlineFileSchema.parse(
    JSON.parse(
      readFileSync(join(contentDir, 'outlines', outlineFileName(lang.data, level.data)), 'utf8'),
    ),
  );
  const ctxOf = (entry: LessonOutlineEntry) => ({ entry, lang: lang.data, level: level.data });

  // The titles already written in this language, any level: a new lesson must not reuse one.
  const usedTitles = new Map<string, string>();
  for (const file of readdirSync(briefsDir).filter(
    (f) => f.startsWith(`${lang.data}-`) && f.endsWith('.json'),
  )) {
    const title = JSON.parse(readFileSync(join(briefsDir, file), 'utf8')).title;
    if (typeof title === 'string') usedTitles.set(foldText(title), title);
  }

  const has = (dir: string, id: string) => existsSync(join(dir, `${id}.json`));
  // A brief without its content file, or the reverse; for vocabulary, any content file.
  const partial = outline.entries.filter((e) =>
    lessons.hasContentFile(e.kind)
      ? has(briefsDir, e.id) !== has(lessonsDir, e.id)
      : has(lessonsDir, e.id),
  );
  const todo = outline.entries
    .filter((e) => !has(briefsDir, e.id) && !has(lessonsDir, e.id))
    .filter((e) => (kind ? e.kind === kind.data : true))
    .filter((e) => (only ? only.includes(e.id) : true))
    .slice(0, max);
  for (const e of partial)
    console.warn(`! ${e.id}: only one of its two files exists, left as it is`);
  if (only)
    for (const id of only.filter((id) => !todo.some((e) => e.id === id)))
      console.warn(`! ${id}: not in ${outlineFileName(lang.data, level.data)}, or already written`);
  if (todo.length === 0) {
    console.log('Nothing to write: every selected lesson already has its files.');
    return;
  }

  if (providerOpt === 'deepseek' && !deepseekKey) {
    throw new Error(
      'DeepSeek API key missing: set DEEPSEEK_API_KEY in .env (or LLM_API_KEY with LLM_PROVIDER=deepseek).',
    );
  }
  const bin = providerOpt === 'claude' ? findClaude() : '';
  const systemPrompts = new Map(LESSON_KINDS.map((k) => [k, systemPrompt(k)]));
  const promptFiles =
    providerOpt === 'claude'
      ? new Map(LESSON_KINDS.map((k) => [k, writeSystemPrompt(k, systemPrompts.get(k)!)]))
      : new Map<string, string>();
  const prettier = await resolveConfig(join(briefsDir, 'x.json'));
  const failedDir = join(WORK_DIR, 'failed');
  mkdirSync(failedDir, { recursive: true });
  const index = new Map(outline.entries.map((e, i) => [e.id, i]));

  console.log(
    `Writing ${todo.length} ${lang.data} ${level.data} lesson${todo.length === 1 ? '' : 's'} with ${model} (${providerOpt})` +
      `${effort ? ` (effort ${effort})` : ''}, ${concurrency} at a time, ${attempts} attempts each.\n` +
      (providerOpt === 'claude'
        ? `claude: ${bin}\n`
        : `api: https://api.deepseek.com/chat/completions\n`),
  );

  let stop: string | undefined;
  const runs: LessonRun[] = [];
  const started = Date.now();

  async function author(entry: LessonOutlineEntry): Promise<LessonRun> {
    const t0 = Date.now();
    const run: LessonRun = {
      id: entry.id,
      kind: entry.kind,
      outcome: 'failed',
      attempts: 0,
      seconds: 0,
      outputTokens: 0,
      inputTokens: 0,
      cachedTokens: 0,
      costUsd: 0,
    };
    const at = index.get(entry.id)!;
    const neighbours = [
      ...outline.entries.slice(Math.max(0, at - 5), at),
      ...outline.entries.slice(at + 1, at + 6),
    ];
    const ctx = ctxOf(entry);
    const claude = {
      bin,
      model,
      effort,
      systemPromptFile: promptFiles.get(entry.kind)!,
      timeoutMs,
    };

    let draft: Draft = { brief: {} };
    let session: string | undefined;
    const messages: ChatMessage[] = [{ role: 'system', content: systemPrompts.get(entry.kind)! }];
    let prompt = lessonPrompt({ ...ctx, neighbours, usedTitles: [...usedTitles.values()] });
    let issues: { path: string; message: string }[] = [];
    try {
      while (run.attempts < attempts && !stop) {
        run.attempts++;
        let reply: ClaudeReply;
        if (providerOpt === 'deepseek') {
          messages.push({ role: 'user', content: prompt });
          reply = await askDeepSeek({
            apiKey: deepseekKey!,
            model,
            messages,
            timeoutMs,
          });
          messages.push({ role: 'assistant', content: reply.text });
        } else {
          reply = await askClaude(prompt, { ...claude, resume: session });
          session = reply.sessionId;
        }
        run.outputTokens += reply.outputTokens;
        run.inputTokens += reply.inputTokens;
        run.cachedTokens += reply.cachedTokens;
        run.costUsd += reply.costUsd;

        let editProblems: string[] = [];
        let parsed: Json;
        try {
          parsed = parseReply(reply.text);
        } catch (e) {
          issues = [
            { path: '', message: `your reply is not one JSON object: ${(e as Error).message}` },
          ];
          prompt = issuesPrompt(issues, []);
          continue;
        }
        if (Array.isArray(parsed?.edits)) editProblems = applyEdits(draft, parsed.edits as Edit[]);
        else {
          if (parsed?.brief && typeof parsed.brief === 'object') draft.brief = parsed.brief;
          else if (!parsed?.content && parsed && typeof parsed === 'object') draft.brief = parsed;
          if (parsed?.content && typeof parsed.content === 'object') draft.content = parsed.content;
        }

        draft = complete(draft, { ...ctx, model, promptVersion: PROMPT_VERSION });
        const result = lessons.validateLesson(draft.brief, draft.content, ctx);
        issues = result.ok ? [] : result.issues;
        if (result.ok) {
          const taken = usedTitles.get(foldText(result.title));
          if (taken !== undefined)
            issues = [
              { path: 'brief.title', message: `"${taken}" is already the title of another lesson` },
            ];
        }
        if (result.ok && issues.length === 0 && editProblems.length === 0) {
          usedTitles.set(foldText(result.title), result.title);
          const write = async (dir: string, value: unknown) =>
            writeFileSync(
              join(dir, `${entry.id}.json`),
              await format(JSON.stringify(value), { ...prettier, parser: 'json' }),
            );
          await write(briefsDir, result.brief);
          if (result.content) await write(lessonsDir, result.content);
          run.outcome = 'written';
          return run;
        }
        prompt = issuesPrompt(issues, editProblems);
      }
      if (stop && run.attempts < attempts) run.outcome = 'quota';
      run.issues = issues.map((i) => `${i.path}: ${i.message}`);
      writeFileSync(
        join(failedDir, `${entry.id}.json`),
        JSON.stringify({ issues: run.issues, ...draft }, null, 2),
      );
      return run;
    } catch (e) {
      if (e instanceof QuotaError) {
        stop ??= e.message;
        run.outcome = 'quota';
      } else run.outcome = 'error';
      run.error = (e as Error).message;
      return run;
    } finally {
      run.seconds = seconds(Date.now() - t0);
    }
  }

  const queue = [...todo];
  let done = 0;
  async function worker() {
    for (let entry = queue.shift(); entry && !stop; entry = queue.shift()) {
      const run = await author(entry);
      runs.push(run);
      done++;
      const mark = { written: '✓', failed: '✗', quota: '⏸', error: '✗' }[run.outcome];
      console.log(
        `${mark} [${done}/${todo.length}] ${run.id.padEnd(40)} ${run.kind.padEnd(10)} ` +
          `${run.attempts} attempt${run.attempts === 1 ? ' ' : 's'}  ${clock(run.seconds).padStart(12)}  ` +
          `out ${kTokens(run.outputTokens).padStart(6)} tok${run.outcome === 'written' ? '' : `  ${run.outcome}`}`,
      );
      if (run.error) console.log(`    ${run.error.slice(0, 300)}`);
      else if (run.outcome === 'failed')
        console.log(
          `    ${run.issues?.length} issues left, draft in ${join(failedDir, `${run.id}.json`)}`,
        );
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));

  // ------------------------------------------------------------------ report
  const wall = seconds(Date.now() - started);
  const written = runs.filter((r) => r.outcome === 'written');
  const total = (f: (r: LessonRun) => number, rs = runs) => rs.reduce((n, r) => n + f(r), 0);
  const perLesson = written.length ? wall / written.length : 0;
  const byKind = LESSON_KINDS.map((k) => {
    const rs = written.filter((r) => r.kind === k);
    return rs.length
      ? `  ${k.padEnd(11)} ${String(rs.length).padStart(3)} written, ${clock(Math.round(total((r) => r.seconds, rs) / rs.length))} and ` +
          `${(total((r) => r.attempts, rs) / rs.length).toFixed(1)} attempts each, out ${kTokens(total((r) => r.outputTokens, rs) / rs.length)} tok each`
      : undefined;
  }).filter(Boolean);
  const remaining = outline.entries.filter((e) => !has(briefsDir, e.id)).length;

  console.log(`
──────────────────────────────────────────────────────────────
 ${written.length} written, ${runs.filter((r) => r.outcome === 'failed' || r.outcome === 'error').length} failed, ${runs.filter((r) => r.outcome === 'quota').length + queue.length} not done (of ${todo.length})
 Time: ${clock(wall)}, so ${clock(Math.round(perLesson))} per written lesson with ${concurrency} at a time
${byKind.join('\n')}
 Tokens: ${kTokens(total((r) => r.outputTokens))} out, ${kTokens(total((r) => r.inputTokens))} in, ${kTokens(total((r) => r.cachedTokens))} read from cache
 API equivalent: $${total((r) => r.costUsd).toFixed(2)} (not billed on a subscription: a measure of the quota used)
 ${remaining} lesson${remaining === 1 ? '' : 's'} of ${lang.data} ${level.data} still without files${perLesson ? `: about ${clock(Math.round(remaining * perLesson))} more at this pace` : ''}
──────────────────────────────────────────────────────────────`);
  if (stop) console.log(`Stopped early, the subscription refused: ${stop.slice(0, 300)}`);

  const reportPath = join(
    WORK_DIR,
    `report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        lang: lang.data,
        level: level.data,
        model,
        effort,
        concurrency,
        attempts,
        wallSeconds: wall,
        runs,
      },
      null,
      2,
    ),
  );
  console.log(`Report: ${reportPath}`);
  if (written.length < runs.length || stop) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
