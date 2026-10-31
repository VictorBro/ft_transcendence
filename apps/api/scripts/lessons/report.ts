/**
 * What lessons:author prints while it runs and at the end (#83): one line
 * per lesson, then the totals, the time per lesson by kind (the figure
 * docs/LESSONS.md quotes) and an estimate for the rest of the level. The
 * same figures go to a JSON report in WORK_DIR.
 */
import { join } from 'node:path';

import { LESSON_KINDS, type LessonOutlineEntry } from '@ft/shared';

import { WORK_DIR, writeWork } from './files';
import type { Provider, Usage } from './providers/chat';

export type Outcome = 'written' | 'failed' | 'quota' | 'error';

/** One lesson's run, as the report keeps it. */
export interface LessonRun extends Usage {
  id: string;
  kind: string;
  outcome: Outcome;
  /** Replies asked for, the first included. */
  attempts: number;
  seconds: number;
  /** The issues left, for a lesson that failed. */
  issues?: string[];
  error?: string;
}

export const newRun = (entry: LessonOutlineEntry): LessonRun => ({
  id: entry.id,
  kind: entry.kind,
  outcome: 'failed',
  attempts: 0,
  seconds: 0,
  inputTokens: 0,
  cachedTokens: 0,
  outputTokens: 0,
  costUsd: 0,
});

/** Adds one reply's usage to the lesson's totals. */
export function addUsage(run: LessonRun, u: Usage): void {
  run.inputTokens += u.inputTokens;
  run.cachedTokens += u.cachedTokens;
  run.outputTokens += u.outputTokens;
  run.costUsd += u.costUsd;
}

/** 75 → "1 min 15 s", 3900 → "1 h 5 min". */
export const clock = (s: number) =>
  s >= 3600
    ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`
    : s >= 60
      ? `${Math.floor(s / 60)} min ${s % 60} s`
      : `${s} s`;
const kTokens = (n: number) => `${(n / 1000).toFixed(1)}k`;
const total = (runs: LessonRun[], f: (r: LessonRun) => number) =>
  runs.reduce((n, r) => n + f(r), 0);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One line per finished lesson: ✓ [3/12] fr-greetings  vocabulary  2 attempts  1 min 40 s … */
export function printProgress(run: LessonRun, done: number, of: number): void {
  const mark = { written: '✓', failed: '✗', quota: '⏸', error: '✗' }[run.outcome];
  console.log(
    `${mark} [${done}/${of}] ${run.id.padEnd(40)} ${run.kind.padEnd(10)} ` +
      `${plural(run.attempts, 'attempt').padEnd(10)}  ${clock(run.seconds).padStart(12)}  ` +
      `out ${kTokens(run.outputTokens).padStart(6)} tok${run.outcome === 'written' ? '' : `  ${run.outcome}`}`,
  );
  if (run.error) console.log(`    ${run.error.slice(0, 300)}`);
  else if (run.outcome === 'failed')
    console.log(
      `    ${plural(run.issues?.length ?? 0, 'issue')} left, draft in ${failedDraftPath(run.id)}`,
    );
}

export const failedDraftPath = (id: string) => join(WORK_DIR, 'failed', `${id}.json`);

export interface Summary {
  runs: LessonRun[];
  /** Lessons selected but never started, because the run stopped. */
  notStarted: number;
  wallSeconds: number;
  concurrency: number;
  provider: Provider;
  /** Lessons of the level still without their files, after this run. */
  remaining: number;
  label: string;
  /** Why the run stopped early, when a quota refused it. */
  stop?: string;
}

/** The end of the run: totals, time per lesson by kind, cost, and the estimate for the rest. */
export function printSummary(s: Summary): void {
  const written = s.runs.filter((r) => r.outcome === 'written');
  const failed = s.runs.filter((r) => r.outcome === 'failed' || r.outcome === 'error').length;
  const notDone = s.runs.filter((r) => r.outcome === 'quota').length + s.notStarted;
  const perLesson = written.length ? s.wallSeconds / written.length : 0;
  const byKind = LESSON_KINDS.flatMap((k) => {
    const rs = written.filter((r) => r.kind === k);
    if (!rs.length) return [];
    const avg = (f: (r: LessonRun) => number) => total(rs, f) / rs.length;
    return [
      `  ${k.padEnd(11)} ${String(rs.length).padStart(3)} written, ${clock(Math.round(avg((r) => r.seconds)))} and ` +
        `${avg((r) => r.attempts).toFixed(1)} attempts each, out ${kTokens(avg((r) => r.outputTokens))} tok each`,
    ];
  });
  const cost = total(s.runs, (r) => r.costUsd).toFixed(2);

  console.log(`
──────────────────────────────────────────────────────────────
 ${written.length} written, ${failed} failed, ${notDone} not done (of ${s.runs.length + s.notStarted})
 Time: ${clock(s.wallSeconds)}, so ${clock(Math.round(perLesson))} per written lesson with ${s.concurrency} at a time
${byKind.join('\n')}
 Tokens: ${kTokens(total(s.runs, (r) => r.outputTokens))} out, ${kTokens(total(s.runs, (r) => r.inputTokens))} in, ${kTokens(total(s.runs, (r) => r.cachedTokens))} read from cache
 ${s.provider.billed ? `Cost: $${cost}, billed to the ${s.provider.name} account` : `API equivalent: $${cost} (not billed on a subscription: a measure of the quota used)`}
 ${plural(s.remaining, 'lesson')} of ${s.label} still without files${perLesson ? `: about ${clock(Math.round(s.remaining * perLesson))} more at this pace` : ''}
──────────────────────────────────────────────────────────────`);
  if (s.stop) console.log(`Stopped early, ${s.provider.name} refused: ${s.stop.slice(0, 300)}`);
}

/** Saves the run as JSON in WORK_DIR; returns the path. */
export function saveReport(s: Summary, extra: Record<string, unknown>): string {
  const name = `report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const { provider, runs, wallSeconds, concurrency } = s;
  const report = {
    ...extra,
    provider: provider.name,
    model: provider.model,
    concurrency,
    wallSeconds,
    runs,
  };
  return writeWork(name, JSON.stringify(report, null, 2));
}
