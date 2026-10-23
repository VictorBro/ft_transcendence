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
import { GenderSchema, WORD_CLASSES } from './vocabulary';

/**
 * Function lessons (SPEC section 8, D50, D51): the brief holds the situation, two roles and the
 * expressions and words with example sentences; the lesson content generated from it holds the
 * model dialogue, every exercise and the exam.
 */

/** Counts of section 8 ("Brief and lesson content"). */
export const FUNCTIONS_LIMITS = {
  /** At least four expressions: lessons of at most 15 minutes (P6-02, feedback #1). */
  expressions: [4, 10],
  words: [0, 6],
  dialogueLines: [8, 14],
  examReplies: [4, 8],
  examGaps: [3, 10],
  distractors: [0, 3],
} as const;

/** Page rules of section 8: seconds per unit, page sizes and the exam limit factor. */
export const FUNCTIONS_PAGE_RULES = {
  expressionCardS: 12,
  wordCardS: 10,
  dialogueBaseS: 20,
  dialogueLineS: 12,
  expressionPairS: 12,
  wordPairS: 10,
  /** Gender page (as in vocabulary): base plus seconds per word. */
  genderBaseS: 20,
  genderWordS: 5,
  /** Matching pages hold at most this many pairs (balanced). */
  matchingPageSize: 6,
  wordOrderS: 25,
  gapChoiceS: 15,
  /** Listening choice: role A's line and four spoken replies (P4-05 review). */
  listeningS: 30,
  replyS: 30,
  /** Exam word translation (P4-05 review), as in vocabulary: seconds per word. */
  translationS: 15,
  /** Exam reply pages hold at most this many replies (balanced). */
  replyPageSize: 4,
  examLineS: 8,
  examGapS: 20,
  timeLimitFactor: 1.5,
} as const;

/** Content steps in lesson order. */
/** Content steps in lesson order; `gender` (P4-05 review) only when the lesson has words. */
export const FUNCTIONS_STAGES = [
  'flashcards',
  'dialogue',
  'matching',
  'gender',
  'dialogue_gaps',
  'word_order',
  'listening',
  'exam',
] as const;

/* =================================================================== brief */

const exampleSchema = (lang: string) =>
  z.strictObject({ text: LearningTextSchema, translation: nativeTextSchema(lang) });

export const functionsExpressionSchema = (lang: string) =>
  z.strictObject({
    id: NestedIdSchema,
    /** The French expression as taught, without a trailing ellipsis: Je voudrais. */
    text: LearningTextSchema,
    /** A sentence start, displayed with a trailing " …" that is never part of an answer. */
    openEnd: z.boolean(),
    translations: nativeTranslationsSchema(lang),
    /** When and how it is used, register (tu/vous). */
    explanation: LocalizedTextSchema,
    example: exampleSchema(lang),
  });
export type FunctionsExpression = z.infer<ReturnType<typeof functionsExpressionSchema>>;

export const functionsWordSchema = (lang: string) =>
  z.strictObject({
    id: NestedIdSchema,
    /** Base term without article: thé. */
    term: LearningTextSchema,
    /** Displayed form, with the indefinite article for nouns where grammatical (D39): un thé. */
    teachingForm: LearningTextSchema,
    translations: nativeTranslationsSchema(lang),
    wordClass: z.enum(WORD_CLASSES),
    /** Accepted genders for nouns; empty for every other word class (D8). */
    genders: z.array(GenderSchema).max(3),
    explanation: LocalizedTextSchema,
    example: exampleSchema(lang),
  });
export type FunctionsWord = z.infer<ReturnType<typeof functionsWordSchema>>;

export const functionsRoleSchema = (lang: string) =>
  z.strictObject({
    id: NestedIdSchema,
    /** French label used in every dialogue: le serveur. */
    label: LearningTextSchema,
    translation: nativeTextSchema(lang),
  });

export const functionsBriefSchema = (lang: string) =>
  z.strictObject({
    ...envelopeShape,
    kind: z.literal('functions'),
    theme: ThemeSchema,
    /** One sentence for the start page: who talks to whom, where. */
    situation: LocalizedTextSchema,
    /** How the expressions cover the outline intent. */
    coverageNotes: LocalizedLongTextSchema,
    prerequisites: z.array(LocalizedTextSchema).max(4),
    roles: z.array(functionsRoleSchema(lang)).length(2),
    expressions: z
      .array(functionsExpressionSchema(lang))
      .min(FUNCTIONS_LIMITS.expressions[0])
      .max(FUNCTIONS_LIMITS.expressions[1]),
    words: z.array(functionsWordSchema(lang)).max(FUNCTIONS_LIMITS.words[1]),
    scoring: ScoringPolicySchema,
  });
export type FunctionsBrief = z.infer<ReturnType<typeof functionsBriefSchema>>;

/* ================================================================= content */

const TokenSchema = z.strictObject({ tokenId: NestedIdSchema, text: LearningTextSchema });
/** A dialogue line shown as context: role A's line above a task. */
const ContextLineSchema = z.strictObject({ roleId: NestedIdSchema, text: LearningTextSchema });

export const functionsItemSchema = (lang: string) =>
  z.discriminatedUnion('type', [
    z.strictObject({
      /** Mother tongue on the front, French with the example on the back; words first, then expressions (P4-05 review). */
      type: z.literal('function_flashcards'),
      itemId: NestedIdSchema,
      side: z.enum(['expressions', 'words']),
      ids: z.array(NestedIdSchema).min(1).max(FUNCTIONS_LIMITS.expressions[1]),
    }),
    z.strictObject({
      /** The model dialogue, revealed line by line; lines can be turned (translation and note). */
      type: z.literal('function_dialogue'),
      itemId: NestedIdSchema,
      lines: z
        .array(
          z.strictObject({
            lineId: NestedIdSchema,
            roleId: NestedIdSchema,
            text: LearningTextSchema,
            translation: nativeTextSchema(lang),
            note: LocalizedTextSchema,
            /** Expressions the line uses. */
            expressionIds: z.array(NestedIdSchema).max(4),
          }),
        )
        .min(FUNCTIONS_LIMITS.dialogueLines[0])
        .max(FUNCTIONS_LIMITS.dialogueLines[1]),
    }),
    z.strictObject({
      /**
       * Gender page (P4-05 review): every noun of the lesson on one page as in vocabulary stage 4, each with
       * a masculine/feminine choice (one unit each); words without a gender are left out (P06-00).
       */
      type: z.literal('function_gender_select'),
      itemId: NestedIdSchema,
      ids: z.array(NestedIdSchema).min(1).max(FUNCTIONS_LIMITS.words[1]),
    }),
    z.strictObject({
      /** Mother-tongue translation on the left, French on the right; one unit per pair. */
      type: z.literal('function_matching'),
      itemId: NestedIdSchema,
      side: z.enum(['expressions', 'words']),
      pairs: z
        .array(z.strictObject({ id: NestedIdSchema, answerExplanation: LocalizedTextSchema }))
        .min(2)
        .max(FUNCTIONS_PAGE_RULES.matchingPageSize),
    }),
    z.strictObject({
      /**
       * Word order. Practice: tokens only (context null, no distractors). Exam part 1: role A's line as
       * context and role B's reply built from tokens with 0–3 distractors that belong to no accepted order.
       */
      type: z.literal('function_word_order'),
      itemId: NestedIdSchema,
      expressionId: NestedIdSchema,
      context: ContextLineSchema.nullable(),
      /** Role of the built sentence; null in practice. */
      roleId: NestedIdSchema.nullable(),
      tokens: z.array(TokenSchema).min(2).max(16),
      distractorTokenIds: z.array(NestedIdSchema).max(FUNCTIONS_LIMITS.distractors[1]),
      acceptedOrders: z.array(z.array(NestedIdSchema).min(2)).min(1).max(4),
      answerExplanation: LocalizedTextSchema,
    }),
    z.strictObject({
      /**
       * Listening choice (P4-05 review): role A's line is only heard; the learner listens to four replies of
       * role B (audio only) and chooses the one that fits. The texts are shown after Check and in the results.
       */
      type: z.literal('function_listening_choice'),
      itemId: NestedIdSchema,
      expressionId: NestedIdSchema,
      context: ContextLineSchema,
      roleId: NestedIdSchema,
      options: z
        .array(z.strictObject({ optionId: NestedIdSchema, text: LearningTextSchema }))
        .length(4),
      answerOptionId: NestedIdSchema,
      answerExplanation: LocalizedTextSchema,
    }),
    z.strictObject({
      /** Role A's line, then role B's line with one gap and four expression choices. */
      type: z.literal('function_dialogue_gap_choice'),
      itemId: NestedIdSchema,
      expressionId: NestedIdSchema,
      context: ContextLineSchema,
      roleId: NestedIdSchema,
      before: z.string().max(200),
      after: z.string().max(200),
      choiceExpressionIds: z.array(NestedIdSchema).length(4),
      answerExplanation: LocalizedTextSchema,
    }),
    z.strictObject({
      /**
       * Exam word translation (P4-05 review), the first exam page as in vocabulary lessons: the mother-tongue
       * prompt of a lesson word, typed in French with its indefinite article.
       */
      type: z.literal('function_translation_exam'),
      itemId: NestedIdSchema,
      wordId: NestedIdSchema,
      prompt: nativeTextSchema(lang),
      accepted: AcceptedAnswersSchema,
      answerExplanation: LocalizedTextSchema,
    }),
    z.strictObject({
      /** Exam part 2: a new dialogue unrolled line by line; gaps take expressions and are typed. */
      type: z.literal('function_dialogue_gap_typing'),
      itemId: NestedIdSchema,
      lines: z
        .array(
          z.strictObject({
            lineId: NestedIdSchema,
            roleId: NestedIdSchema,
            /** The whole line when it has no gap, else the text before the gap. */
            before: z.string().max(300),
            /** The whole line in every mother tongue: the learner translates it into the gap (P4-05 review). */
            translation: nativeTextSchema(lang),
            gap: z
              .strictObject({
                gapId: NestedIdSchema,
                expressionId: NestedIdSchema,
                accepted: AcceptedAnswersSchema,
                answerExplanation: LocalizedTextSchema,
              })
              .nullable(),
            after: z.string().max(300),
          }),
        )
        .min(FUNCTIONS_LIMITS.dialogueLines[0])
        .max(FUNCTIONS_LIMITS.dialogueLines[1]),
    }),
  ]);
export type FunctionsItem = z.infer<ReturnType<typeof functionsItemSchema>>;

const pageSchema = (lang: string) =>
  z.strictObject({
    pageId: NestedIdSchema,
    estimatedDurationS: DurationSecondsSchema,
    /** Exam pages only: the page estimate × 1.5, rounded. */
    timeLimitS: TimeLimitSecondsSchema.nullable(),
    instructions: LocalizedTextSchema,
    items: z.array(functionsItemSchema(lang)).min(1).max(FUNCTIONS_LIMITS.words[1]),
  });

export const functionsContentSchema = (lang: string) =>
  z.strictObject({
    ...envelopeShape,
    kind: z.literal('functions'),
    theme: ThemeSchema,
    steps: z
      .array(
        z.strictObject({
          id: NestedIdSchema,
          stage: z.enum(FUNCTIONS_STAGES),
          role: z.enum(['presentation', 'exercise', 'exam']),
          label: LocalizedLabelSchema,
          pages: z.array(pageSchema(lang)).min(1).max(20),
        }),
      )
      .min(FUNCTIONS_STAGES.length - 1)
      .max(FUNCTIONS_STAGES.length),
  });
export type FunctionsContent = z.infer<ReturnType<typeof functionsContentSchema>>;
