/**
 * The complete step: everything in a lesson file that Claude is not asked
 * to write, because the code knows it or computes it exactly.
 *
 *   Claude's draft ─→ complete() ─→ validateLesson
 *                     envelope, provenance, scoring,
 *                     every duration the validators check to the second
 *
 * It runs on the raw draft, before any schema: a field the draft left out
 * is added, a wrong one is overwritten. Anything it cannot compute yet
 * (a draft too broken to read) is left for validateLesson to report.
 */
import { createHash } from 'node:crypto';

import { lessons, type Level, type Language, type LessonOutlineEntry } from '@ft/shared';

// Drafts are read untyped: they come from a model and have not passed a schema yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

export interface Draft {
  brief: Json;
  /** Undefined for a vocabulary lesson. */
  content?: Json;
}

export interface CompleteContext {
  entry: LessonOutlineEntry;
  lang: Language;
  level: Level;
  model: string;
  promptVersion: string;
}

export const GENERATOR = 'ft lessons:author';
const SCORING = { practiceWeight: 35, examWeight: 65, orthographyCredit: 0.5 };

/** Sorted keys, no whitespace: the same value always gives the same text, so the same hash. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

const sha256 = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');

const isObject = (v: unknown): v is Record<string, Json> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const pagesOf = (file: Json): Json[] =>
  Array.isArray(file?.steps)
    ? file.steps.flatMap((s: Json) => (Array.isArray(s?.pages) ? s.pages : []))
    : [];
const minutes = (seconds: number) => Math.max(1, Math.round(seconds / 60));
const sum = (xs: number[]) => xs.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);

/**
 * The envelope first, in the schema's order, then the rest of the draft:
 * the files read the same as the prototype's, whatever order Claude used.
 */
function envelope(file: Json, ctx: CompleteContext, provenance: Json): Json {
  const { entry } = ctx;
  const { kind } = entry;
  const head = {
    schemaVersion: lessons.ARTIFACT_SCHEMA_VERSION,
    id: entry.id,
    lang: ctx.lang,
    level: ctx.level,
    locales: ['en', 'fr', 'de'],
    title: file.title,
    objective: file.objective,
    estimatedMinutes: file.estimatedMinutes,
    provenance,
    kind,
    ...(kind === 'grammar' ? { topic: entry.topic } : { theme: entry.theme }),
  };
  return { ...head, ...file, ...head, provenance };
}

/** Computes every number the validators recompute, on the completed files. */
function computeTimes(brief: Json, content: Json | undefined, ctx: CompleteContext) {
  switch (ctx.entry.kind) {
    case 'vocabulary': {
      if (Array.isArray(brief.targets)) brief.targetCount = brief.targets.length;
      // The builder needs a sound brief; a broken one is reported by validateLesson instead.
      try {
        brief.estimatedMinutes = lessons.vocabularyMinutes(lessons.vocabularyLesson(brief).steps);
      } catch {
        /* left as drafted */
      }
      return;
    }
    case 'grammar': {
      // Claude chooses the grammar durations (within GRAMMAR_LENGTH); only the totals follow.
      if (Array.isArray(brief.blocks) && isObject(brief.exam) && Array.isArray(brief.exam.pages))
        brief.estimatedMinutes = minutes(
          sum(
            brief.blocks.map(
              (b: Json) =>
                (b?.explanationDurationS ?? 0) +
                sum((b?.exercises ?? []).map((e: Json) => e?.estimatedDurationS ?? 0)),
            ),
          ) +
            (brief.feedbackPlaceholder?.estimatedDurationS ?? 0) +
            sum(brief.exam.pages.map((p: Json) => p?.estimatedDurationS ?? 0)),
        );
      if (!content) return;
      const limits = new Map<string, number>(
        (brief.exam?.pages ?? []).map((p: Json) => [p?.pageId, p?.timeLimitS]),
      );
      for (const step of content.steps ?? [])
        for (const page of step?.pages ?? [])
          if (isObject(page))
            page.timeLimitS = step.role === 'exam' ? (limits.get(page.pageId) ?? null) : null;
      content.estimatedMinutes = minutes(sum(pagesOf(content).map((p) => p?.estimatedDurationS)));
      return;
    }
    case 'functions': {
      if (!content) return;
      for (const step of content.steps ?? []) {
        const exam = step?.stage === 'exam';
        for (const page of step?.pages ?? []) {
          if (!isObject(page) || !Array.isArray(page.items)) continue;
          try {
            page.estimatedDurationS = lessons.functionsPageEstimate(page.items, exam);
            page.timeLimitS = exam ? lessons.functionsTimeLimit(page.estimatedDurationS) : null;
          } catch {
            /* left as drafted */
          }
        }
      }
      content.estimatedMinutes = minutes(sum(pagesOf(content).map((p) => p?.estimatedDurationS)));
      brief.estimatedMinutes = content.estimatedMinutes;
      return;
    }
    case 'reading': {
      if (!content || !Array.isArray(content.documents)) return;
      const documents = new Map<string, Json>(
        content.documents.map((d: Json) => [d?.documentId, d]),
      );
      const main = documents.get('main');
      for (const step of content.steps ?? []) {
        const exam = step?.stage === 'exam';
        for (const page of step?.pages ?? []) {
          if (!isObject(page) || !Array.isArray(page.items)) continue;
          try {
            for (const item of page.items)
              if (item?.type === 'reading_document')
                item.skimSeconds =
                  item.view === 'skim' && main ? lessons.readingSkimSeconds(main, ctx.level) : null;
            page.estimatedDurationS = lessons.readingPageEstimate(
              page.items,
              documents,
              ctx.level,
              exam,
            );
            page.timeLimitS = exam ? lessons.readingTimeLimit(page.estimatedDurationS) : null;
          } catch {
            /* left as drafted */
          }
        }
      }
      content.estimatedMinutes = lessons.readingMinutes(
        pagesOf(content).map((p) => p?.estimatedDurationS ?? 0),
      );
      brief.estimatedMinutes = content.estimatedMinutes;
      return;
    }
  }
}

/** Returns the completed files; the draft is not changed. */
export function complete(draft: Draft, ctx: CompleteContext): Draft {
  const generatedAt = new Date().toISOString();
  const outline = sha256({ entry: ctx.entry, lang: ctx.lang, level: ctx.level });
  const provenance = (inputHashes: Json) => ({
    generator: GENERATOR,
    model: ctx.model,
    promptVersion: ctx.promptVersion,
    generatedAt,
    inputHashes,
  });

  const raw = structuredClone(draft);
  const brief = envelope(isObject(raw.brief) ? raw.brief : {}, ctx, provenance({ outline }));
  brief.scoring = SCORING;
  const content =
    ctx.entry.kind === 'vocabulary' || !isObject(raw.content)
      ? undefined
      : { ...raw.content, title: brief.title, objective: brief.objective };

  computeTimes(brief, content, ctx);
  if (!content) return { brief };
  // The content is written from the brief: its hash is taken once the brief is final.
  const completed = envelope(content, ctx, provenance({ outline, brief: sha256(brief) }));
  completed.title = brief.title;
  completed.objective = brief.objective;
  return { brief, content: completed };
}

/**
 * One change Claude asks for instead of rewriting a whole file: a value at
 * a path (the dotted paths of the issues: steps.2.pages.0), or its removal.
 */
export interface Edit {
  file: 'brief' | 'content';
  path: string;
  value?: Json;
  delete?: boolean;
}

/** Applies the edits in order; returns a message per edit that could not apply. */
export function applyEdits(draft: Draft, edits: Edit[]): string[] {
  const problems: string[] = [];
  for (const edit of edits) {
    const root = edit.file === 'content' ? draft.content : draft.brief;
    const keys = String(edit.path ?? '')
      .split('.')
      .filter(Boolean);
    if (!isObject(root) || keys.length === 0) {
      problems.push(`${edit.file}.${edit.path}: no such file or empty path`);
      continue;
    }
    let parent: Json = root;
    for (const key of keys.slice(0, -1)) parent = parent?.[key];
    const last = keys[keys.length - 1];
    if (parent === null || typeof parent !== 'object') {
      problems.push(`${edit.file}.${edit.path}: the path does not exist`);
      continue;
    }
    if (edit.delete) {
      if (Array.isArray(parent)) parent.splice(Number(last), 1);
      else delete parent[last];
    } else parent[last] = edit.value;
  }
  return problems;
}
