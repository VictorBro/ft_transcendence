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
 * The schemas of a vocabulary lesson: a list of words to learn, such as
 * "the objects of the classroom".
 *
 * A vocabulary lesson is one file, its brief. There is no content file:
 * ../domain/vocabularyLesson.ts builds the playable lesson from the brief,
 * the same way for every lesson.
 *
 * content/briefs/fr-classroom-objects.json
 * ┌───────────────────────────────────────────┐
 * │ ENVELOPE (artifactCommon.ts)              │
 * │ kind: "vocabulary", theme: "education"    │
 * ├───────────────────────────────────────────┤
 * │ notes for the reviewer, targetCount       │
 * │ groups   ── 1 to 6, each with its words   │
 * │ targets  ── 1 to 60 words, each with      │
 * │             every text its exercises need │
 * │ scoring                                   │
 * └───────────────────────────────────────────┘
 *                      │ vocabularyLesson(brief)
 *                      ▼
 * the playable lesson (vocabularyContentSchema, never a file):
 * introduction → flashcards → matching → gender → gaps → listening → exam
 *
 * The file has two parts:
 * - brief: the file written by hand, checked by vocabularyBriefSchema;
 * - content: the lesson that vocabularyLesson builds. The schema checks
 *   that the builder's output has the right shape (in the tests).
 *
 * The word lists (WORD_CLASSES, GenderSchema) are also used by
 * functions.ts, whose lessons teach a few words too.
 */

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

/**
 * One word of a vocabulary lesson, with everything its exercises need:
 * the brief is the whole lesson, and ../domain/vocabularyLesson.ts builds
 * the pages from it. A function of the course language: a French course
 * translates into { en, de }, a German one into { en, fr }.
 *
 * This checks the shape only. ../validation/ checks the rest: only nouns
 * have genders, a number and an article; the article matches the gender;
 * every id listed here points to a word of the same lesson.
 */
export const vocabularyTargetSchema = (lang: string) =>
  z.strictObject({
    id: NestedIdSchema,
    /** The word alone, without article: livre. */
    term: LearningTextSchema,
    translations: nativeTranslationsSchema(lang),
    wordClass: z.enum(WORD_CLASSES),
    /** The genders a noun accepts; empty for any other word. */
    genders: z.array(GenderSchema).max(3),
    /** Singular or plural for a noun; null for any other word. */
    number: z.enum(['singular', 'plural']).nullable(),
    /** The form shown to learn the word, with its article for a noun: un livre. */
    teachingForm: LearningTextSchema,
    /** Every answer accepted in the exam, with its article for a noun: un livre. */
    examForms: z.array(LearningTextSchema).min(1).max(4),
    /** Why a noun is taught without un/une/des (a country, a set phrase); null otherwise. */
    articleException: LocalizedTextSchema.nullable(),
    /** The word's other gender or number (espagnole for espagnol), so the exam question can say which one it wants. */
    genderVariants: z.array(LearningTextSchema).max(4),
    /** In phonetic alphabet: /œ̃ livʁ/. */
    pronunciation: LearningTextSchema,
    difficulty: z.enum(['core', 'demanding']),
    /** An example sentence and its translation. */
    context: z.strictObject({ sentence: LearningTextSchema, translation: nativeTextSchema(lang) }),
    /** A warning when the word is easy to confuse; null otherwise. */
    ambiguityNote: LocalizedTextSchema.nullable(),
    /*
     * The texts of the exercises. Every word appears in every exercise.
     */
    /** Why the answer is right: shown when matching, listening, translation and dictation are corrected. */
    explanation: LocalizedTextSchema,
    /** Nouns only: the word's gender and article, shown when the gender exercise is corrected; null otherwise. */
    genderExplanation: LocalizedTextSchema.nullable(),
    /** A clearer translation when two words of one group translate the same; null otherwise. */
    matchingLabel: nativeTextSchema(lang).nullable(),
    /** The exam question when the first translation is ambiguous ("waiter, masculine"); null asks with the first translation. */
    examPrompt: nativeTextSchema(lang).nullable(),
    /** A sentence with a gap: before + gap + after. The learner types the word without its article. */
    gap: z.strictObject({
      before: z.string().max(200),
      after: z.string().max(200),
      /** The answers, without article. */
      accepted: AcceptedAnswersSchema,
      /** Four different words of the lesson, this one included, shown as a hint; only this one fits the gap. */
      referenceTargetIds: z.array(NestedIdSchema).length(4),
      explanation: LocalizedTextSchema,
    }),
    /** The four written choices of the listening exercise, this word included, ideally words that sound alike. */
    listeningOptionTargetIds: z.array(NestedIdSchema).length(4),
  });
export type VocabularyTarget = z.infer<ReturnType<typeof vocabularyTargetSchema>>;

/**
 * The fields of a word that are exercise texts rather than the word
 * itself. Nothing here reads it; kept from the prototype, whose
 * generator wrote these fields in a second pass.
 */
export const TARGET_EXERCISE_FIELDS = {
  explanation: true,
  genderExplanation: true,
  matchingLabel: true,
  examPrompt: true,
  gap: true,
  listeningOptionTargetIds: true,
} as const;

/**
 * A group of words, shown together: a heading, its words, and a short
 * text that introduces them. Every word of the lesson is in exactly one
 * group (checked in ../validation/).
 */
export const vocabularyGroupSchema = z.strictObject({
  id: NestedIdSchema,
  label: LocalizedLabelSchema,
  targetIds: z.array(NestedIdSchema).min(1).max(16),
  /**
   * In simple Markdown: paragraphs, "- " and "1. " lists, **bold** and
   * `forms` in the language being learned. ../domain/richText.ts parses
   * it; ../validation/ rejects anything else, and checks that en, fr and
   * de have the same paragraphs and lists.
   */
  introduction: LocalizedLongTextSchema,
});

/**
 * A whole vocabulary lesson: content/briefs/<id>.json. There is no
 * content file: ../domain/vocabularyLesson.ts builds the pages from this.
 * A function of the course language, like vocabularyTargetSchema.
 *
 * coverageNotes, countRationale, difficultyBalance, prerequisites and
 * scoring are there for whoever reviews the lesson; no code reads them.
 * ../validation/ checks that targetCount is the number of targets and
 * that estimatedMinutes matches the pages built from the brief.
 */
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
 * The playable vocabulary lesson. Nobody writes it and no file holds it:
 * ../domain/vocabularyLesson.ts builds it from the brief. These schemas
 * describe what the builder must return, and the tests check it.
 *
 * A lesson is a list of steps, a step a list of pages, and a page a list
 * of items (an exercise or a text):
 *
 *   lesson ─ steps[] ─ pages[] ─ items[]
 *            matching   match-1   vocabulary_matching (6 pairs)
 */

/**
 * The field every exercise has: the text shown when it is corrected.
 * Spread into each exercise below (`...unit`).
 */
const unit = { answerExplanation: LocalizedTextSchema };

/**
 * One item of a page. `type` says which of the eight it is, and each type
 * has its own fields. The brief field each one is built from is given
 * below.
 */
const vocabularyItemSchema = (lang: string) =>
  z.discriminatedUnion('type', [
    /** A group's words with its introduction text (groups[].introduction). Nothing to correct. */
    z.strictObject({
      type: z.literal('vocabulary_introduction'),
      itemId: NestedIdSchema,
      targetIds: z.array(NestedIdSchema).min(1),
      text: LocalizedLongTextSchema,
    }),
    /** A group's words as flashcards. Nothing to correct. */
    z.strictObject({
      type: z.literal('vocabulary_flashcards'),
      itemId: NestedIdSchema,
      targetIds: z.array(NestedIdSchema).min(1),
    }),
    /** Match each word with its translation, 2 to 12 pairs. */
    z.strictObject({
      type: z.literal('vocabulary_matching'),
      itemId: NestedIdSchema,
      pairs: z
        .array(
          z.strictObject({
            targetId: NestedIdSchema,
            /** The word's matchingLabel; null shows its first translation. */
            nativeLabel: nativeTextSchema(lang).nullable(),
            ...unit,
          }),
        )
        .min(2)
        .max(12),
    }),
    /**
     * Choose the gender of every noun of the lesson, one row per noun
     * (genderExplanation). Other words are left out.
     */
    z.strictObject({
      type: z.literal('vocabulary_gender_select'),
      itemId: NestedIdSchema,
      targetIds: z.array(NestedIdSchema).min(1),
      rows: z.array(z.strictObject({ targetId: NestedIdSchema, ...unit })).min(1),
    }),
    /** Type the missing word in a sentence (targets[].gap). */
    z.strictObject({
      type: z.literal('vocabulary_typed_gap'),
      itemId: NestedIdSchema,
      targetId: NestedIdSchema,
      before: z.string().max(200),
      after: z.string().max(200),
      /** Four different words shown as a hint, the answer included. */
      referenceTargetIds: z.array(NestedIdSchema).length(4),
      /** The answers, without article. */
      accepted: AcceptedAnswersSchema,
      ...unit,
    }),
    /** Hear the word, pick it among four written words (listeningOptionTargetIds). */
    z.strictObject({
      type: z.literal('vocabulary_listening_choice'),
      itemId: NestedIdSchema,
      targetId: NestedIdSchema,
      optionTargetIds: z.array(NestedIdSchema).length(4),
      ...unit,
    }),
    /** Exam: read the translation, type the word with its article (examForms). */
    z.strictObject({
      type: z.literal('vocabulary_translation_exam'),
      itemId: NestedIdSchema,
      targetId: NestedIdSchema,
      /** The word's examPrompt, or its first translation. */
      prompt: nativeTextSchema(lang),
      accepted: AcceptedAnswersSchema,
      ...unit,
    }),
    /** Exam: hear the word, type it with its article (examForms). */
    z.strictObject({
      type: z.literal('vocabulary_listening_dictation'),
      itemId: NestedIdSchema,
      targetId: NestedIdSchema,
      accepted: AcceptedAnswersSchema,
      ...unit,
    }),
  ]);
export type VocabularyItem = z.infer<ReturnType<typeof vocabularyItemSchema>>;

/**
 * The six stages of every vocabulary lesson, in order. "overview" is the
 * gender exercise; "practice" holds the gaps, then the listening choices.
 */
export const VOCABULARY_STAGES = [
  'introduction',
  'flashcards',
  'matching',
  'overview',
  'practice',
  'exam',
] as const;

/**
 * One screen of the lesson: an instruction and 1 to 12 items. The page
 * durations are fixed rules in ../domain/vocabularyLesson.ts
 * (VOCABULARY_TIMING), and they add up to estimatedMinutes.
 */
const pageSchema = (lang: string) =>
  z.strictObject({
    pageId: NestedIdSchema,
    estimatedDurationS: DurationSecondsSchema,
    /** The exam's countdown; null on every other page. */
    timeLimitS: TimeLimitSecondsSchema.nullable(),
    instructions: LocalizedTextSchema,
    items: z.array(vocabularyItemSchema(lang)).min(1).max(12),
  });

/**
 * The playable vocabulary lesson: the same envelope as the brief, then
 * its steps. `stage` says which of the six stages a step belongs to;
 * `role` says how it is shown (a text to read, an exercise, the gender
 * overview, the exam).
 */
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
      /** Seven steps for six stages: "practice" has two steps, the gaps
      then the listening. A lesson without nouns has no gender step,
      so six steps. */
      .min(VOCABULARY_STAGES.length)
      .max(VOCABULARY_STAGES.length + 1),
  });
export type VocabularyContent = z.infer<ReturnType<typeof vocabularyContentSchema>>;
