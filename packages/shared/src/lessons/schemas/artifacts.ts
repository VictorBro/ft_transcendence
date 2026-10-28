import type { z } from 'zod';

import type { LessonKind } from '../../schemas/lesson';
import {
  functionsBriefSchema,
  functionsContentSchema,
  type FunctionsBrief,
  type FunctionsContent,
} from './functions';
import {
  grammarBriefSchema,
  grammarContentSchema,
  type GrammarBrief,
  type GrammarContent,
} from './grammar';
import {
  readingBriefSchema,
  readingContentSchema,
  type ReadingBrief,
  type ReadingContent,
} from './reading';
import {
  vocabularyBriefSchema,
  vocabularyContentSchema,
  type VocabularyBrief,
  type VocabularyContent,
} from './vocabulary';

/**
 * The switchboard of the lesson schemas: given a lesson's kind and course
 * language, it returns the right schema for its brief or content file.
 * The validators call it, so they never need to know the four kinds
 * apart:
 *
 *   briefSchema('grammar', 'fr')   → grammarBriefSchema('fr')
 *   contentSchema('reading', 'de') → readingContentSchema('de')
 *
 * It also names the union types Brief and LessonContent: "a brief (or a
 * content file) of any kind".
 */

/**
 * The lesson kinds that have schemas. Today that is all four of
 * LESSON_KINDS; isSupportedKind lets the validators reject a kind that
 * would be added to LESSON_KINDS later without schemas of its own.
 */
export const SUPPORTED_ARTIFACT_KINDS = [
  'vocabulary',
  'grammar',
  'functions',
  'reading',
] as const satisfies readonly LessonKind[];
export type SupportedKind = (typeof SUPPORTED_ARTIFACT_KINDS)[number];

/**
 * true when `kind` has schemas. The return type `kind is SupportedKind`
 * tells TypeScript that after `if (isSupportedKind(kind))`, kind is a
 * SupportedKind.
 */
export function isSupportedKind(kind: LessonKind): kind is SupportedKind {
  return (SUPPORTED_ARTIFACT_KINDS as readonly string[]).includes(kind);
}

/**
 * A brief of any kind. Each kind has its own `kind` value ("vocabulary",
 * "grammar"…), so after `if (brief.kind === 'grammar')` TypeScript knows
 * it is a GrammarBrief.
 */
export type Brief = VocabularyBrief | GrammarBrief | FunctionsBrief | ReadingBrief;
/** A content file of any kind, the same way. */
export type LessonContent = VocabularyContent | GrammarContent | FunctionsContent | ReadingContent;

/** The schema of a brief, for this kind and course language. */
export function briefSchema(kind: SupportedKind, lang: string): z.ZodType<Brief> {
  if (kind === 'reading') return readingBriefSchema(lang);
  return kind === 'vocabulary'
    ? vocabularyBriefSchema(lang)
    : kind === 'grammar'
      ? grammarBriefSchema(lang)
      : functionsBriefSchema(lang);
}

/**
 * Whether a lesson of this kind has a content file. A vocabulary lesson
 * is its brief only; the other kinds also have content/lessons/<id>.json.
 */
export function hasContentFile(kind: LessonKind): boolean {
  return kind !== 'vocabulary';
}

/**
 * The schema of a content file, for this kind and course language. For
 * vocabulary it describes the lesson that ../domain/vocabularyLesson.ts
 * builds, since there is no file.
 */
export function contentSchema(kind: SupportedKind, lang: string): z.ZodType<LessonContent> {
  if (kind === 'reading') return readingContentSchema(lang);
  return kind === 'vocabulary'
    ? vocabularyContentSchema(lang)
    : kind === 'grammar'
      ? grammarContentSchema(lang)
      : functionsContentSchema(lang);
}
