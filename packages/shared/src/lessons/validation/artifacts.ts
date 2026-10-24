import type { z } from 'zod';

import {
  briefSchema,
  contentSchema,
  hasContentFile,
  isSupportedKind,
  type Brief,
  type LessonContent,
} from '../schemas/artifacts';
import type { LessonOutlineEntry } from '../../schemas/lesson';
import { checkMinutes, sum } from './common';
import { checkFunctionsBrief, checkFunctionsContent } from './functions';
import { checkGrammarBrief, checkGrammarContent } from './grammar';
import { Issues, type Issue } from './issues';
import { checkReadingBrief, checkReadingContent } from './reading';
import { checkVocabularyBrief } from './vocabulary';

/**
 * Validates a lesson file: a brief, or a content file.
 *
 * The schemas (../schemas/) check the shape of a file: the fields, their
 * types, their lengths. They cannot check that the file makes sense: that
 * an id refers to something that exists, that each word is used in its
 * example, that the content follows its brief. The validators check that,
 * in two passes:
 *
 *   the file (JSON) ─→ 1. the schema       ─→ 2. the checks of its kind ─→ ValidationResult
 *                         (shape; stops       (every issue found,
 *                          here if wrong)      not only the first)
 *
 * The checks of each kind are in their own file: vocabulary.ts,
 * grammar.ts, functions.ts, reading.ts. What several kinds share is in
 * common.ts.
 *
 * A valid file can still teach badly: language quality is for a human
 * reviewer, not for these checks.
 */

export type { Issue } from './issues';
export { grammarBriefLengthIssues, grammarContentLengthIssues } from './grammarLength';

/**
 * - valid: no issue;
 * - invalid: at least one issue;
 * - stale: no issue, but the file was written from an older version of
 *   its outline entry or brief (see staleReasons).
 */
export type ArtifactStatus = 'valid' | 'invalid' | 'stale';

export interface ValidationResult<T> {
  status: ArtifactStatus;
  /** The parsed file, when it passed its schema. */
  value?: T;
  issues: Issue[];
  /** Why the file is stale: the outline entry or brief changed since it was written. */
  staleReasons: string[];
}

/** Where the file belongs: its entry in the outline, and the course. */
export interface OutlineContext {
  entry: LessonOutlineEntry;
  lang: string;
  level: string;
  /** The entry's current hash, to detect a stale file; leave it out to skip that check. */
  outlineHash?: string;
}

/** A content file also needs its brief, already validated. */
export interface ContentContext extends OutlineContext {
  brief: Brief;
  /** The brief's current hash, to detect a stale file; leave it out to skip that check. */
  briefHash?: string;
}

const invalid = (issues: Issue[]) => ({
  status: 'invalid' as const,
  issues,
  staleReasons: [],
});

const schemaIssues = (error: z.ZodError): Issue[] =>
  error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));

/** The result once every check has run: invalid with any issue, else stale or valid. */
function finish<T>(value: T, issues: Issues, stale: string[]): ValidationResult<T> {
  if (issues.list.length)
    return { status: 'invalid', value, issues: issues.list, staleReasons: stale };
  return { status: stale.length ? 'stale' : 'valid', value, issues: [], staleReasons: stale };
}

/** The file is the one the outline entry plans: same id, kind, course, and topic or theme. */
function checkEnvelope(v: Brief | LessonContent, ctx: OutlineContext, issues: Issues) {
  const { entry } = ctx;
  issues.check(v.id === entry.id, 'id', `must equal the outline ID ${entry.id}`);
  issues.check(v.kind === entry.kind, 'kind', `must equal the outline kind ${entry.kind}`);
  issues.check(v.lang === ctx.lang, 'lang', `must equal the course language ${ctx.lang}`);
  issues.check(v.level === ctx.level, 'level', `must equal the course level ${ctx.level}`);
  if (v.kind === 'grammar')
    issues.check(v.topic === entry.topic, 'topic', `must equal the outline topic ${entry.topic}`);
  else
    issues.check(v.theme === entry.theme, 'theme', `must equal the outline theme ${entry.theme}`);
}

/* =================================================================== brief */

export function validateBrief(data: unknown, ctx: OutlineContext): ValidationResult<Brief> {
  const { kind } = ctx.entry;
  if (!isSupportedKind(kind))
    return invalid([{ path: 'kind', message: `${kind} lessons have no agreed brief schema yet` }]);
  const parsed = briefSchema(kind, ctx.lang).safeParse(data);
  if (!parsed.success) return invalid(schemaIssues(parsed.error));

  const brief = parsed.data;
  const issues = new Issues();
  checkEnvelope(brief, ctx, issues);
  switch (brief.kind) {
    case 'vocabulary':
      checkVocabularyBrief(brief, ctx, issues);
      break;
    case 'grammar':
      checkGrammarBrief(brief, issues);
      break;
    case 'reading':
      checkReadingBrief(brief, issues);
      break;
    case 'functions':
      checkFunctionsBrief(brief, ctx, issues);
      break;
  }

  const stale = [];
  if (ctx.outlineHash && brief.provenance.inputHashes.outline !== ctx.outlineHash)
    stale.push('the outline entry changed after this brief was generated');
  return finish(brief, issues, stale);
}

/* ================================================================= content */

export function validateContent(
  data: unknown,
  ctx: ContentContext,
): ValidationResult<LessonContent> {
  const { kind } = ctx.entry;
  if (!isSupportedKind(kind))
    return invalid([
      { path: 'kind', message: `${kind} lessons have no agreed content schema yet` },
    ]);
  // A vocabulary lesson is built from its brief alone.
  if (!hasContentFile(kind))
    return invalid([
      {
        path: '',
        message: 'vocabulary lessons have no content file: the brief is the whole lesson (P2-04)',
      },
    ]);
  const parsed = contentSchema(kind, ctx.lang).safeParse(data);
  if (!parsed.success) return invalid(schemaIssues(parsed.error));

  const content = parsed.data;
  const { brief } = ctx;
  const issues = new Issues();
  checkEnvelope(content, ctx, issues);

  // Every kind: unique step, page and item ids, and estimatedMinutes from the page durations.
  const steps: {
    id: string;
    pages: { pageId: string; estimatedDurationS: number; items: { itemId: string }[] }[];
  }[] = content.steps;
  const pages = steps.flatMap((s) => s.pages);
  issues.unique(
    steps.map((s) => s.id),
    'steps',
    'step ID',
  );
  issues.unique(
    pages.map((p) => p.pageId),
    'steps',
    'page ID',
  );
  issues.unique(
    pages.flatMap((p) => p.items.map((i) => i.itemId)),
    'steps',
    'item ID',
  );
  checkMinutes(content.estimatedMinutes, sum(pages.map((p) => p.estimatedDurationS)), issues);

  if (content.kind === 'grammar' && brief.kind === 'grammar')
    checkGrammarContent(content, brief, issues);
  if (content.kind === 'functions' && brief.kind === 'functions')
    checkFunctionsContent(content, brief, issues);
  if (content.kind === 'reading' && brief.kind === 'reading')
    checkReadingContent(content, brief, issues);

  const stale = [];
  if (ctx.outlineHash && content.provenance.inputHashes.outline !== ctx.outlineHash)
    stale.push('the outline entry changed after this content was generated');
  if (ctx.briefHash && content.provenance.inputHashes.brief !== ctx.briefHash)
    stale.push('the brief changed after this content was generated');
  return finish(content, issues, stale);
}
