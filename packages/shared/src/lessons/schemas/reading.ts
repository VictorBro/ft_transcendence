import { z } from 'zod';

import {
  DurationSecondsSchema,
  envelopeShape,
  LearningTextSchema,
  LocalizedLabelSchema,
  LocalizedLongTextSchema,
  LocalizedTextSchema,
  NestedIdSchema,
  nativeTranslationsSchema,
  ScoringPolicySchema,
  TEXT_LIMITS,
  TimeLimitSecondsSchema,
} from './artifactCommon';
import type { Level } from '../../schemas/item';
import { ThemeSchema } from '../../schemas/lesson';

/**
 * Reading lessons (SPEC section 9, D54): "prepare, then read". The brief plans the key words, both
 * documents and the questions; the lesson content holds both documents once and the six steps. Every
 * document uses one layout whatever its genre, and every exercise reuses a shared control. Documents,
 * questions, options and pieces stay in the learning language: translating them would give the
 * answers away. Cross-reference rules live in src/validation/reading.ts, page rules in
 * src/domain/readingLesson.ts.
 */

/** Genres steer the text an author or the generator writes; the player shows every genre the same way. */
export const READING_GENRES = [
  'text_message',
  'email',
  'letter',
  'postcard',
  'invitation',
  'sign',
  'notice',
  'menu',
  'recipe',
  'classified_ad',
  'profile',
  'programme',
  'timetable',
  'article',
  'forum_post',
  'review',
  'dictionary_entry',
  'contract',
  'speech',
  'poem',
  'other',
] as const;
export const ReadingGenreSchema = z.enum(READING_GENRES);
export type ReadingGenre = z.infer<typeof ReadingGenreSchema>;

/** Words of the main and the exam document per level (section 9, "Page rules"). Starting values (P5-05). */
export const READING_WORDS: Record<
  Level,
  { main: readonly [number, number]; exam: readonly [number, number] }
> = {
  A1: { main: [40, 80], exam: [20, 40] },
  A2: { main: [80, 150], exam: [40, 75] },
  B1: { main: [150, 250], exam: [75, 125] },
  B2: { main: [250, 400], exam: [125, 200] },
  C1: { main: [400, 550], exam: [200, 275] },
  C2: { main: [550, 700], exam: [275, 350] },
};

/** Counts of section 9. */
export const READING_LIMITS = {
  keywords: [4, 6],
  detailQuestions: [3, 4],
  examQuestions: 5,
  options: [3, 4],
  paragraphs: [1, 12],
  orderPieces: [3, 6],
  skimSeconds: [15, 300],
} as const;

/** Content steps in lesson order: stage 1 is two steps, so flashcards and matching are separate points (D53). */
export const READING_STAGES = [
  'flashcards',
  'matching',
  'skim',
  'detail',
  'structure',
  'exam',
] as const;
export type ReadingStage = (typeof READING_STAGES)[number];

/** What the one skim question asks about the document as a whole. */
export const SKIM_FOCUS = ['genre', 'author', 'purpose'] as const;
export const READING_QUESTION_TYPES = ['reading_choice', 'reading_true_false'] as const;

/* =================================================================== brief */

export const readingKeywordSchema = (lang: string) =>
  z.strictObject({
    id: NestedIdSchema,
    /** As it is taught, in the learning language: on se voit. */
    term: LearningTextSchema,
    /** Meanings per mother tongue: the flashcard front; the first one is the matching label. */
    translations: nativeTranslationsSchema(lang),
    /** The flashcard back and the correction text of the matching. */
    explanation: LocalizedTextSchema,
  });
export type ReadingKeyword = z.infer<ReturnType<typeof readingKeywordSchema>>;

const DocumentPlanSchema = z.strictObject({
  targetWords: z.number().int().min(10).max(1000),
  /** What the document says, so the content step writes the planned text. */
  contents: LocalizedLongTextSchema,
});

export const readingBriefSchema = (lang: string) =>
  z.strictObject({
    ...envelopeShape,
    kind: z.literal('reading'),
    theme: ThemeSchema,
    genre: ReadingGenreSchema,
    /** Who writes to whom, and why. */
    situation: LocalizedTextSchema,
    /** What the learner must find in the document (from the outline intent). */
    readerTask: LocalizedTextSchema,
    keywords: z
      .array(readingKeywordSchema(lang))
      .min(READING_LIMITS.keywords[0])
      .max(READING_LIMITS.keywords[1]),
    documents: z.strictObject({ main: DocumentPlanSchema, exam: DocumentPlanSchema }),
    skim: z.strictObject({ focus: z.enum(SKIM_FOCUS) }),
    detailQuestions: z
      .array(
        z.strictObject({
          id: NestedIdSchema,
          type: z.enum(READING_QUESTION_TYPES),
          focus: LocalizedTextSchema,
        }),
      )
      .min(READING_LIMITS.detailQuestions[0])
      .max(READING_LIMITS.detailQuestions[1]),
    /** The question types of the five exam questions. */
    exam: z.strictObject({
      types: z.array(z.enum(READING_QUESTION_TYPES)).min(1).max(READING_QUESTION_TYPES.length),
    }),
    scoring: ScoringPolicySchema,
  });
export type ReadingBrief = z.infer<ReturnType<typeof readingBriefSchema>>;

/* ================================================================= content */

export const ReadingDocumentSchema = z.strictObject({
  documentId: z.enum(['main', 'exam']),
  title: LearningTextSchema.nullable(),
  /** One small line above the text: sender, date, byline, address… */
  meta: z.array(LearningTextSchema).max(4),
  /** Paragraphs in reading order; a line break inside starts a new line (menu line, verse, timetable row). */
  paragraphs: z
    .array(z.string().trim().min(1).max(TEXT_LIMITS.long))
    .min(READING_LIMITS.paragraphs[0])
    .max(READING_LIMITS.paragraphs[1]),
  /** Key words to mark (main document only): `text` is copied word for word from a paragraph. */
  highlights: z
    .array(z.strictObject({ keywordId: NestedIdSchema, text: LearningTextSchema }))
    .max(24),
});
export type ReadingDocument = z.infer<typeof ReadingDocumentSchema>;

const OptionsSchema = z
  .array(z.strictObject({ optionId: NestedIdSchema, text: LearningTextSchema }))
  .min(READING_LIMITS.options[0])
  .max(READING_LIMITS.options[1]);

export const readingItemSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('reading_flashcards'),
    itemId: NestedIdSchema,
    keywordIds: z.array(NestedIdSchema).min(1),
  }),
  /** Meaning ↔ key word on the vocabulary matching board; labels and explanations come from the brief. */
  z.strictObject({
    type: z.literal('reading_keyword_matching'),
    itemId: NestedIdSchema,
    keywordIds: z.array(NestedIdSchema).min(2),
  }),
  z.strictObject({
    type: z.literal('reading_document'),
    itemId: NestedIdSchema,
    documentId: z.enum(['main', 'exam']),
    view: z.enum(['skim', 'open', 'exam']),
    /** Skim view only: seconds before the document is put away (section 9, "Skim time"). */
    skimSeconds: z
      .number()
      .int()
      .min(READING_LIMITS.skimSeconds[0])
      .max(READING_LIMITS.skimSeconds[1])
      .nullable(),
  }),
  z.strictObject({
    type: z.literal('reading_skim_choice'),
    itemId: NestedIdSchema,
    focus: z.enum(SKIM_FOCUS),
    question: LearningTextSchema,
    options: OptionsSchema,
    answerOptionId: NestedIdSchema,
    answerExplanation: LocalizedTextSchema,
  }),
  z.strictObject({
    type: z.literal('reading_choice'),
    itemId: NestedIdSchema,
    question: LearningTextSchema,
    options: OptionsSchema,
    answerOptionId: NestedIdSchema,
    answerExplanation: LocalizedTextSchema,
  }),
  z.strictObject({
    type: z.literal('reading_true_false'),
    itemId: NestedIdSchema,
    statement: LearningTextSchema,
    answer: z.enum(['true', 'false']),
    answerExplanation: LocalizedTextSchema,
  }),
  /** Pieces of information in the order the text gives them (the word-order control, with phrases). */
  z.strictObject({
    type: z.literal('reading_order'),
    itemId: NestedIdSchema,
    pieces: z
      .array(z.strictObject({ pieceId: NestedIdSchema, text: LearningTextSchema }))
      .min(READING_LIMITS.orderPieces[0])
      .max(READING_LIMITS.orderPieces[1]),
    acceptedOrders: z.array(z.array(NestedIdSchema)).min(1).max(2),
    answerExplanation: LocalizedTextSchema,
  }),
]);
export type ReadingItem = z.infer<typeof readingItemSchema>;

const PageSchema = z.strictObject({
  pageId: NestedIdSchema,
  estimatedDurationS: DurationSecondsSchema,
  /** Exam page only: 1.5 × its estimate, rounded up to 5 s (D18 exception). */
  timeLimitS: TimeLimitSecondsSchema.nullable(),
  instructions: LocalizedTextSchema,
  items: z
    .array(readingItemSchema)
    .min(1)
    .max(1 + READING_LIMITS.examQuestions),
});

/** Takes the course language like the other kinds; reading items have no per-mother-tongue fields. */
export const readingContentSchema = (_lang: string) =>
  z.strictObject({
    ...envelopeShape,
    kind: z.literal('reading'),
    theme: ThemeSchema,
    genre: ReadingGenreSchema,
    documents: z.array(ReadingDocumentSchema).length(2),
    steps: z
      .array(
        z.strictObject({
          id: NestedIdSchema,
          stage: z.enum(READING_STAGES),
          role: z.enum(['exercise', 'exam']),
          label: LocalizedLabelSchema,
          pages: z.array(PageSchema).length(1),
        }),
      )
      .length(READING_STAGES.length),
  });
export type ReadingContent = z.infer<ReturnType<typeof readingContentSchema>>;

/** The labels of a true / false statement, in the learning language like every answer option. */
export const TRUE_FALSE_LABELS: Record<string, Record<'true' | 'false', string>> = {
  fr: { true: 'Vrai', false: 'Faux' },
  de: { true: 'Richtig', false: 'Falsch' },
  en: { true: 'True', false: 'False' },
};
