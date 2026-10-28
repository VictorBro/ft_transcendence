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
 * The schemas of a functions lesson: what to say in one everyday
 * situation, such as "ordering at a café".
 *
 * A functions lesson is two files with the same id. The brief holds the
 * situation, its two roles (the customer, the waiter), the expressions to
 * learn (Je voudrais…) and a few words (un thé). The content file is the
 * playable lesson written from it: a model dialogue, the exercises and
 * the exam.
 *
 * content/briefs/fr-ordering-at-a-cafe.json  content/lessons/fr-ordering-at-a-cafe.json
 * ┌──────────────────────────────┐            ┌──────────────────────────────┐
 * │ ENVELOPE, kind, theme        │            │ ENVELOPE, kind, theme        │
 * ├──────────────────────────────┤            ├──────────────────────────────┤
 * │ situation, roles (2)         │            │ steps, always in this order: │
 * │ expressions (4 to 10)        │     →      │ flashcards, dialogue,        │
 * │ words (0 to 6)               │            │ matching, gender (if nouns), │
 * │                              │            │ dialogue_gaps, word_order,   │
 * │                              │            │ listening, exam              │
 * └──────────────────────────────┘            └──────────────────────────────┘
 *
 * Words use the same WORD_CLASSES and genders as vocabulary.ts.
 * ../validation/ checks that the content uses the brief's expressions,
 * words and roles, that the steps come in this order, and that each
 * page's duration follows FUNCTIONS_PAGE_RULES
 * (../domain/functionsLesson.ts computes it).
 */

/** How many of each thing a lesson has, as [min, max]. */
export const FUNCTIONS_LIMITS = {
  /** Expressions to learn. */
  expressions: [4, 10],
  /** Words to learn; a lesson can have none. */
  words: [0, 6],
  /** Lines in a dialogue. */
  dialogueLines: [8, 14],
  /** Replies the learner builds in the exam (word order). */
  examReplies: [4, 8],
  /** Gaps in the exam dialogue. */
  examGaps: [3, 10],
  /** Extra wrong words mixed into an exam word order. */
  distractors: [0, 3],
} as const;

/**
 * The fixed rules a page's estimatedDurationS must follow, in seconds:
 * per card, per line, per pair, per item… (names ending in S), plus how
 * many items fit on one page. ../domain/functionsLesson.ts adds them up
 * for each page; an exam page's countdown is that estimate × 1.5,
 * rounded (timeLimitFactor).
 */
export const FUNCTIONS_PAGE_RULES = {
  expressionCardS: 12,
  wordCardS: 10,
  dialogueBaseS: 20,
  dialogueLineS: 12,
  expressionPairS: 12,
  wordPairS: 10,
  /** Gender page, as in vocabulary: 20 s plus 5 s per noun. */
  genderBaseS: 20,
  genderWordS: 5,
  /** At most 6 pairs on a matching page; the pages are balanced (7 → 4 + 3). */
  matchingPageSize: 6,
  wordOrderS: 25,
  gapChoiceS: 15,
  /** Listening choice: hear one line, then four replies. */
  listeningS: 30,
  replyS: 30,
  /** Exam: translating one word, as in vocabulary. */
  translationS: 15,
  /** At most 4 replies on an exam page; the pages are balanced. */
  replyPageSize: 4,
  examLineS: 8,
  examGapS: 20,
  timeLimitFactor: 1.5,
} as const;

/**
 * The steps of every functions lesson, in order. "gender" is there only
 * when the lesson's words include a noun, so 7 or 8 steps.
 */
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

/** An example sentence in the language being learned, with its translations. */
const exampleSchema = (lang: string) =>
  z.strictObject({ text: LearningTextSchema, translation: nativeTextSchema(lang) });

/** One expression to learn, such as "Je voudrais…". */
export const functionsExpressionSchema = (lang: string) =>
  z.strictObject({
    id: NestedIdSchema,
    /** The expression as taught, without "…" at the end: Je voudrais. */
    text: LearningTextSchema,
    /**
     * true when the expression is the start of a sentence: it is shown
     * with " …" at the end, and the "…" is never part of an answer.
     */
    openEnd: z.boolean(),
    translations: nativeTranslationsSchema(lang),
    /** When and how to use it, and whether it is formal (vous) or not (tu). */
    explanation: LocalizedTextSchema,
    example: exampleSchema(lang),
  });
export type FunctionsExpression = z.infer<ReturnType<typeof functionsExpressionSchema>>;

/**
 * One word to learn, such as "un thé". A smaller version of a vocabulary
 * word (vocabularyTargetSchema), with the same article rules.
 */
export const functionsWordSchema = (lang: string) =>
  z.strictObject({
    id: NestedIdSchema,
    /** The word alone, without article: thé. */
    term: LearningTextSchema,
    /** The form shown, with its article for a noun: un thé. */
    teachingForm: LearningTextSchema,
    translations: nativeTranslationsSchema(lang),
    wordClass: z.enum(WORD_CLASSES),
    /** The genders a noun accepts; empty for any other word. */
    genders: z.array(GenderSchema).max(3),
    explanation: LocalizedTextSchema,
    example: exampleSchema(lang),
  });
export type FunctionsWord = z.infer<ReturnType<typeof functionsWordSchema>>;

/** One of the two people who talk, such as the waiter. */
export const functionsRoleSchema = (lang: string) =>
  z.strictObject({
    id: NestedIdSchema,
    /** Its name in the language being learned, shown in every dialogue: le serveur. */
    label: LearningTextSchema,
    translation: nativeTextSchema(lang),
  });

/**
 * The plan of a functions lesson: content/briefs/<id>.json. A function
 * of the course language, for the translations.
 */
export const functionsBriefSchema = (lang: string) =>
  z.strictObject({
    ...envelopeShape,
    kind: z.literal('functions'),
    theme: ThemeSchema,
    /** One sentence for the start page: who talks to whom, where. */
    situation: LocalizedTextSchema,
    /** How the expressions cover what the outline entry asks for. For the reviewer. */
    coverageNotes: LocalizedLongTextSchema,
    /** For the reviewer. */
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

/*
 * The playable functions lesson: content/lessons/<id>.json, written from
 * the brief. A lesson is a list of steps, a step a list of pages, and a
 * page a list of items. Most items point to the brief's expressions,
 * words and roles by id.
 */

/**
 * One word or punctuation mark of a sentence the learner rearranges. Each
 * has its own id, so the same word can appear twice.
 */
const TokenSchema = z.strictObject({ tokenId: NestedIdSchema, text: LearningTextSchema });
/** A line said by the other person, shown above the task as context. */
const ContextLineSchema = z.strictObject({ roleId: NestedIdSchema, text: LearningTextSchema });

/**
 * One item of a page. `type` says which of the nine it is, and each type
 * has its own fields.
 */
export const functionsItemSchema = (lang: string) =>
  z.discriminatedUnion('type', [
    z.strictObject({
      /**
       * Cards to flip: the translation on the front, the expression or
       * word and its example on the back. The words come first, then
       * the expressions. Nothing to correct.
       */
      type: z.literal('function_flashcards'),
      itemId: NestedIdSchema,
      side: z.enum(['expressions', 'words']),
      ids: z.array(NestedIdSchema).min(1).max(FUNCTIONS_LIMITS.expressions[1]),
    }),
    z.strictObject({
      /**
       * The model dialogue, shown line by line. A line can be turned
       * over to see its translation and a note. Nothing to correct.
       */
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
       * Choose the gender of every noun of the lesson, on one page, as in
       * a vocabulary lesson. Other words are left out.
       */
      type: z.literal('function_gender_select'),
      itemId: NestedIdSchema,
      ids: z.array(NestedIdSchema).min(1).max(FUNCTIONS_LIMITS.words[1]),
    }),
    z.strictObject({
      /** Match each translation (left) with its expression or word (right). */
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
       * Put the words of a sentence in order. Two uses:
       * - in the exercises: the words only (context, roleId null, no
       *   distractors);
       * - in the exam: the other person's line as context, and the
       *   learner builds the reply, with 0 to 3 wrong words mixed in
       *   (distractorTokenIds) that belong to no right order.
       */
      type: z.literal('function_word_order'),
      itemId: NestedIdSchema,
      expressionId: NestedIdSchema,
      context: ContextLineSchema.nullable(),
      /** Who says the sentence built; null in the exercises. */
      roleId: NestedIdSchema.nullable(),
      tokens: z.array(TokenSchema).min(2).max(16),
      distractorTokenIds: z.array(NestedIdSchema).max(FUNCTIONS_LIMITS.distractors[1]),
      /** Every right order, as lists of tokenIds, 1 to 4. */
      acceptedOrders: z.array(z.array(NestedIdSchema).min(2)).min(1).max(4),
      answerExplanation: LocalizedTextSchema,
    }),
    z.strictObject({
      /**
       * Hear the other person's line, then four possible replies, and
       * pick the one that fits. Audio only; the texts appear once the
       * answer is checked.
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
      /**
       * The other person's line, then a reply with a gap: pick the
       * expression that fills it among four.
       */
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
       * Exam: read a word's translation, type the word with its article
       * (un thé). When the lesson has words, the exam's first page
       * translates every one of them.
       */
      type: z.literal('function_translation_exam'),
      itemId: NestedIdSchema,
      wordId: NestedIdSchema,
      prompt: nativeTextSchema(lang),
      accepted: AcceptedAnswersSchema,
      answerExplanation: LocalizedTextSchema,
    }),
    z.strictObject({
      /**
       * Exam, last page: a new dialogue, shown line by line. Some lines
       * have a gap where the learner types an expression.
       */
      type: z.literal('function_dialogue_gap_typing'),
      itemId: NestedIdSchema,
      lines: z
        .array(
          z.strictObject({
            lineId: NestedIdSchema,
            roleId: NestedIdSchema,
            /** The whole line when it has no gap, else the text before the gap. */
            before: z.string().max(300),
            /** The whole line, translated: it tells the learner what to type in the gap. */
            translation: nativeTextSchema(lang),
            /** The gap; null for a line without one. */
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

/**
 * One screen of the lesson: an instruction and 1 to 6 items. (The limit
 * reuses the maximum number of words, which is also 6.)
 */
const pageSchema = (lang: string) =>
  z.strictObject({
    pageId: NestedIdSchema,
    estimatedDurationS: DurationSecondsSchema,
    /** The exam's countdown: the page's estimate × 1.5, rounded; null on every other page. */
    timeLimitS: TimeLimitSecondsSchema.nullable(),
    instructions: LocalizedTextSchema,
    items: z.array(functionsItemSchema(lang)).min(1).max(FUNCTIONS_LIMITS.words[1]),
  });

/**
 * The playable functions lesson: the same envelope as the brief, then
 * one step per stage of FUNCTIONS_STAGES, in that order (7 or 8 steps).
 * `role` says how a step is shown: flashcards and dialogue are a
 * presentation, exam is the exam, the rest are exercises.
 */
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
