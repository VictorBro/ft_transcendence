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

/** Categories with an agreed brief/content contract; functions since P4-02, reading since P5-02. */
export const SUPPORTED_ARTIFACT_KINDS = [
  'vocabulary',
  'grammar',
  'functions',
  'reading',
] as const satisfies readonly LessonKind[];
export type SupportedKind = (typeof SUPPORTED_ARTIFACT_KINDS)[number];

export function isSupportedKind(kind: LessonKind): kind is SupportedKind {
  return (SUPPORTED_ARTIFACT_KINDS as readonly string[]).includes(kind);
}

/**
 * Categories the offline Gemini generator produces. Function and reading lessons are written by hand until
 * the product owner decides on their generation after the test lessons (D51, P4-06; D54, P5-07).
 */
export const GENERATED_KINDS = [
  'vocabulary',
  'grammar',
] as const satisfies readonly SupportedKind[];
export type GeneratedKind = (typeof GENERATED_KINDS)[number];

export function isGeneratedKind(kind: LessonKind): kind is GeneratedKind {
  return (GENERATED_KINDS as readonly string[]).includes(kind);
}

export type Brief = VocabularyBrief | GrammarBrief | FunctionsBrief | ReadingBrief;
export type LessonContent = VocabularyContent | GrammarContent | FunctionsContent | ReadingContent;

/** The Draft (brief) schema for a lesson kind and learning language. */
export function briefSchema(kind: SupportedKind, lang: string): z.ZodType<Brief> {
  if (kind === 'reading') return readingBriefSchema(lang);
  return kind === 'vocabulary'
    ? vocabularyBriefSchema(lang)
    : kind === 'grammar'
      ? grammarBriefSchema(lang)
      : functionsBriefSchema(lang);
}

/** Vocabulary lessons consist of the brief only (P2-04); other kinds also have a lesson content file. */
export function hasContentFile(kind: LessonKind): boolean {
  return kind !== 'vocabulary';
}

/** The renderable lesson content schema; never a brief schema (SPEC section 4). */
export function contentSchema(kind: SupportedKind, lang: string): z.ZodType<LessonContent> {
  if (kind === 'reading') return readingContentSchema(lang);
  return kind === 'vocabulary'
    ? vocabularyContentSchema(lang)
    : kind === 'grammar'
      ? grammarContentSchema(lang)
      : functionsContentSchema(lang);
}
