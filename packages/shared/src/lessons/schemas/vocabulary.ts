import { z } from 'zod';

import {
  AcceptedAnswersSchema,
  DurationSecondsSchema,
  envelopeShape,
  LearningTextSchema,
  LocalizedLabelSchema,
  LocalizedLongTextSchema,
  LocalizedTextSchema,
  NestedIdSchema,
  nativeTextSchema,
  nativeTranslationsSchema,
  ScoringPolicySchema,
  TimeLimitSecondsSchema,
} from './artifactCommon';
import { ThemeSchema } from '../../schemas/lesson';

/**
 * The kinds of word a lesson can teach: noun, verb, adjective… A word
 * that fits none of them is "phrase" (a set expression such as "s'il
 * vous plaît") or "other". Used by vocabulary and functions lessons.
 */
export const WORD_CLASSES = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'pronoun',
  'numeral',
  'letter',
  'preposition',
  'conjunction',
  'interjection',
  'phrase',
  'other',
] as const;

/**
 * The grammatical genders a noun can have. "neuter" is for German
 * (das Buch); French nouns use only the first two. A noun lists every
 * gender it accepts (un/une élève); any other word lists none. That
 * rule, and the match between gender and article (un, une), are
 * checked in ../validation/, not here.
 */
export const GENDERS = ['masculine', 'feminine', 'neuter'] as const;
export const GenderSchema = z.enum(GENDERS);
export type Gender = z.infer<typeof GenderSchema>;

/* =================================================================== brief */

export const vocabularyTargetSchema = (lang: string) =>
  z.strictObject({
    id: NestedIdSchema,
    /** Base term in the learning language, without article: livre. */
    term: LearningTextSchema,
    translations: nativeTranslationsSchema(lang),
    wordClass: z.enum(WORD_CLASSES),
    /** Accepted genders for nouns; empty for every other word class (D8). */
    genders: z.array(GenderSchema).max(3),
    number: z.enum(['singular', 'plural']).nullable(),
    /** Displayed form with the teaching article where applicable: un livre. */
    teachingForm: LearningTextSchema,
    /** Full accepted exam answers, article included where required (D39). */
    examForms: z.array(LearningTextSchema).min(1).max(4),
    /** Why a noun has no indefinite-article form (proper names, set phrases…); null otherwise. */
    articleException: LocalizedTextSchema.nullable(),
    /** Forms for the other gender/number (espagnol / espagnole), used for prompt disambiguation. */
    genderVariants: z.array(LearningTextSchema).max(4),
    pronunciation: LearningTextSchema,
    difficulty: z.enum(['core', 'demanding']),
    context: z.strictObject({ sentence: LearningTextSchema, translation: nativeTextSchema(lang) }),
    ambiguityNote: LocalizedTextSchema.nullable(),
    /*
     * Exercise texts (P2-04: the brief is the whole vocabulary lesson; there is no content file).
     * Every word takes part in every exercise; the application derives pages, durations and limits.
     */
    /** Why the French form means this word: correction text of matching, listening choice, translation and dictation. */
    explanation: LocalizedTextSchema,
    /** Nouns only: lexical gender and indefinite article, shown when the gender choice is corrected; null otherwise. */
    genderExplanation: LocalizedTextSchema.nullable(),
    /** Disambiguated native label when two words of one matching group share a translation in some locale; null otherwise. */
    matchingLabel: nativeTextSchema(lang).nullable(),
    /** Native exam prompt when the first translation is ambiguous (e.g. gender of a nationality); null uses the first translation. */
    examPrompt: nativeTextSchema(lang).nullable(),
    /** Typed context gap: before + gap + after; the gap takes the word without its article. */
    gap: z.strictObject({
      before: z.string().max(200),
      after: z.string().max(200),
      /** Article-free answers. */
      accepted: AcceptedAnswersSchema,
      /** Four distinct, non-clickable reference words including the answer, of which only the answer fits. */
      referenceTargetIds: z.array(NestedIdSchema).length(4),
      explanation: LocalizedTextSchema,
    }),
    /** Listening choice: four distinct written options including the word, preferably similar-sounding. */
    listeningOptionTargetIds: z.array(NestedIdSchema).length(4),
  });
export type VocabularyTarget = z.infer<ReturnType<typeof vocabularyTargetSchema>>;

/** Exercise-text fields of a target, generated after the word inventory (P2-04). */
export const TARGET_EXERCISE_FIELDS = {
  explanation: true,
  genderExplanation: true,
  matchingLabel: true,
  examPrompt: true,
  gap: true,
  listeningOptionTargetIds: true,
} as const;

/** Groups keep large inventories manageable; every target belongs to exactly one. */
export const vocabularyGroupSchema = z.strictObject({
  id: NestedIdSchema,
  label: LocalizedLabelSchema,
  targetIds: z.array(NestedIdSchema).min(1).max(16),
  /** Introduction text of the group in restricted Markdown (D46). */
  introduction: LocalizedLongTextSchema,
});

export const vocabularyBriefSchema = (lang: string) =>
  z.strictObject({
    ...envelopeShape,
    kind: z.literal('vocabulary'),
    theme: ThemeSchema,
    coverageNotes: LocalizedLongTextSchema,
    targetCount: z.number().int().min(1).max(60),
    countRationale: LocalizedTextSchema,
    difficultyBalance: LocalizedTextSchema,
    prerequisites: z.array(LocalizedTextSchema).max(4),
    groups: z.array(vocabularyGroupSchema).min(1).max(6),
    targets: z.array(vocabularyTargetSchema(lang)).min(1).max(60),
    scoring: ScoringPolicySchema,
  });
export type VocabularyBrief = z.infer<ReturnType<typeof vocabularyBriefSchema>>;

/* ================================================================= content */

/*
 * The renderable vocabulary lesson. It is never stored: the application derives it from the brief
 * (src/domain/vocabularyLesson.ts) for sessions and previews.
 */

const unit = { answerExplanation: LocalizedTextSchema };

const vocabularyItemSchema = (lang: string) =>
  z.discriminatedUnion('type', [
    z.strictObject({
      type: z.literal('vocabulary_introduction'),
      itemId: NestedIdSchema,
      targetIds: z.array(NestedIdSchema).min(1),
      text: LocalizedLongTextSchema,
    }),
    z.strictObject({
      type: z.literal('vocabulary_flashcards'),
      itemId: NestedIdSchema,
      targetIds: z.array(NestedIdSchema).min(1),
    }),
    z.strictObject({
      type: z.literal('vocabulary_matching'),
      itemId: NestedIdSchema,
      pairs: z
        .array(
          z.strictObject({
            targetId: NestedIdSchema,
            /** Disambiguated native label where two targets share a translation in some locale. */
            nativeLabel: nativeTextSchema(lang).nullable(),
            ...unit,
          }),
        )
        .min(2)
        .max(12),
    }),
    z.strictObject({
      type: z.literal('vocabulary_gender_select'),
      itemId: NestedIdSchema,
      /** The nouns of the lesson, each with a row (P06-00: words without a gender are left out). */
      targetIds: z.array(NestedIdSchema).min(1),
      rows: z.array(z.strictObject({ targetId: NestedIdSchema, ...unit })).min(1),
    }),
    z.strictObject({
      type: z.literal('vocabulary_typed_gap'),
      itemId: NestedIdSchema,
      targetId: NestedIdSchema,
      before: z.string().max(200),
      after: z.string().max(200),
      /** Four distinct, non-clickable reference targets including the answer. */
      referenceTargetIds: z.array(NestedIdSchema).length(4),
      /** Article-free answers. */
      accepted: AcceptedAnswersSchema,
      ...unit,
    }),
    z.strictObject({
      type: z.literal('vocabulary_listening_choice'),
      itemId: NestedIdSchema,
      targetId: NestedIdSchema,
      optionTargetIds: z.array(NestedIdSchema).length(4),
      ...unit,
    }),
    z.strictObject({
      type: z.literal('vocabulary_translation_exam'),
      itemId: NestedIdSchema,
      targetId: NestedIdSchema,
      prompt: nativeTextSchema(lang),
      accepted: AcceptedAnswersSchema,
      ...unit,
    }),
    z.strictObject({
      type: z.literal('vocabulary_listening_dictation'),
      itemId: NestedIdSchema,
      targetId: NestedIdSchema,
      accepted: AcceptedAnswersSchema,
      ...unit,
    }),
  ]);
export type VocabularyItem = z.infer<ReturnType<typeof vocabularyItemSchema>>;

export const VOCABULARY_STAGES = [
  'introduction',
  'flashcards',
  'matching',
  'overview',
  'practice',
  'exam',
] as const;

const pageSchema = (lang: string) =>
  z.strictObject({
    pageId: NestedIdSchema,
    estimatedDurationS: DurationSecondsSchema,
    /** Exam pages only; equals the brief's page limit. */
    timeLimitS: TimeLimitSecondsSchema.nullable(),
    instructions: LocalizedTextSchema,
    items: z.array(vocabularyItemSchema(lang)).min(1).max(12),
  });

export const vocabularyContentSchema = (lang: string) =>
  z.strictObject({
    ...envelopeShape,
    kind: z.literal('vocabulary'),
    theme: ThemeSchema,
    steps: z
      .array(
        z.strictObject({
          id: NestedIdSchema,
          stage: z.enum(VOCABULARY_STAGES),
          role: z.enum(['introduction', 'exercise', 'overview', 'exam']),
          label: LocalizedLabelSchema,
          pages: z.array(pageSchema(lang)).min(1).max(60),
        }),
      )
      // Six stages in seven steps: stage 5 is split into typed gaps and listening (P2-04); a lesson without
      // nouns has no gender stage (P06-00).
      .min(VOCABULARY_STAGES.length)
      .max(VOCABULARY_STAGES.length + 1),
  });
export type VocabularyContent = z.infer<ReturnType<typeof vocabularyContentSchema>>;
