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
 * The schemas of a reading lesson: understand a short real-life text,
 * such as a text message or a train timetable. First learn its key
 * words, then read.
 *
 * A reading lesson is two files with the same id. The brief plans the
 * key words, the two documents (one to practise on, a new one for the
 * exam) and the questions. The content file holds both documents and the
 * six steps, one page each.
 *
 * content/briefs/fr-reading-a-text-message.json  content/lessons/fr-reading-a-text-message.json
 * ┌───────────────────────────────┐              ┌───────────────────────────────┐
 * │ ENVELOPE, kind, theme, genre  │              │ ENVELOPE, kind, theme, genre  │
 * ├───────────────────────────────┤              ├───────────────────────────────┤
 * │ situation, readerTask         │              │ documents: main, exam         │
 * │ keywords (4 to 6)             │      →       │ steps, one page each:         │
 * │ documents: what each says     │              │  flashcards, matching, skim,  │
 * │ skim, detailQuestions, exam   │              │  detail, structure, exam      │
 * └───────────────────────────────┘              └───────────────────────────────┘
 *
 * The documents, questions and answer choices stay in the language being
 * learned: translating them would give the answers away. Only the
 * instructions and corrections are in en, fr and de.
 *
 * ../validation/reading.ts checks that the content follows the brief;
 * ../domain/readingLesson.ts computes word counts and page durations.
 */

/**
 * The kinds of document. The genre guides whoever writes the text; every
 * genre is shown the same way.
 */
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

/**
 * How many words each document has, per level, as [min, max]: `main` is
 * the document the lesson practises on, `exam` the shorter new one of the
 * exam. The brief's targetWords and the real word count must both fit
 * (checked in ../validation/reading.ts).
 */
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

/** How many of each thing a lesson has, as [min, max] or an exact number. */
export const READING_LIMITS = {
  /** Key words to learn before reading. */
  keywords: [4, 6],
  /** Questions on the details of the main document. */
  detailQuestions: [3, 4],
  /** Questions in the exam, always 5. */
  examQuestions: 5,
  /** Answer choices of a question. */
  options: [3, 4],
  /** Paragraphs of a document. */
  paragraphs: [1, 12],
  /** Pieces to put in order in the structure exercise. */
  orderPieces: [3, 6],
  /** How long the skim view shows the document before hiding it, in seconds. */
  skimSeconds: [15, 300],
} as const;

/**
 * The six steps of every reading lesson, in order, one page each:
 * - flashcards, matching: learn the key words;
 * - skim: read the main document quickly, then it is hidden and one
 *   question asks about the whole (who wrote it, why…);
 * - detail: questions on details, the document open;
 * - structure: put pieces of information in the order the text gives
 *   them;
 * - exam: a new document and five questions.
 */
export const READING_STAGES = [
  'flashcards',
  'matching',
  'skim',
  'detail',
  'structure',
  'exam',
] as const;
export type ReadingStage = (typeof READING_STAGES)[number];

/** What the skim question asks about the document as a whole: its kind, who wrote it, or why. */
export const SKIM_FOCUS = ['genre', 'author', 'purpose'] as const;
/** The two kinds of question: pick one choice, or say true or false. */
export const READING_QUESTION_TYPES = ['reading_choice', 'reading_true_false'] as const;

/* =================================================================== brief */

/** One key word to learn before reading. */
export const readingKeywordSchema = (lang: string) =>
  z.strictObject({
    id: NestedIdSchema,
    /** As it is taught, in the language being learned: on se voit. */
    term: LearningTextSchema,
    /** Its meanings: the front of the flashcard; the first one is used in the matching. */
    translations: nativeTranslationsSchema(lang),
    /** The back of the flashcard, and the correction text of the matching. */
    explanation: LocalizedTextSchema,
  });
export type ReadingKeyword = z.infer<ReturnType<typeof readingKeywordSchema>>;

/** The plan of one document: how many words, and what it says. */
const DocumentPlanSchema = z.strictObject({
  targetWords: z.number().int().min(10).max(1000),
  /** What the document says, so the content file's text follows the plan. */
  contents: LocalizedLongTextSchema,
});

/**
 * The plan of a reading lesson: content/briefs/<id>.json. A function of
 * the course language, for the key words' translations.
 */
export const readingBriefSchema = (lang: string) =>
  z.strictObject({
    ...envelopeShape,
    kind: z.literal('reading'),
    theme: ThemeSchema,
    genre: ReadingGenreSchema,
    /** Who writes to whom, and why. */
    situation: LocalizedTextSchema,
    /** What the learner must find in the document, from the outline entry. */
    readerTask: LocalizedTextSchema,
    keywords: z
      .array(readingKeywordSchema(lang))
      .min(READING_LIMITS.keywords[0])
      .max(READING_LIMITS.keywords[1]),
    /** main: the document of the lesson; exam: a new, shorter one for the exam. */
    documents: z.strictObject({ main: DocumentPlanSchema, exam: DocumentPlanSchema }),
    skim: z.strictObject({ focus: z.enum(SKIM_FOCUS) }),
    /** The detail questions, in order: their type, and what each one asks about. */
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
    /** The question types the five exam questions may use. */
    exam: z.strictObject({
      types: z.array(z.enum(READING_QUESTION_TYPES)).min(1).max(READING_QUESTION_TYPES.length),
    }),
    scoring: ScoringPolicySchema,
  });
export type ReadingBrief = z.infer<ReturnType<typeof readingBriefSchema>>;

/* ================================================================= content */

/*
 * The playable reading lesson: content/lessons/<id>.json, written from
 * the brief. It holds the two documents once, then six steps of one page
 * each; a page shows a document by its id (reading_document).
 */

/**
 * One document, written out: an optional title, a few small lines above
 * the text (sender, date, address…), then the paragraphs.
 */
export const ReadingDocumentSchema = z.strictObject({
  documentId: z.enum(['main', 'exam']),
  title: LearningTextSchema.nullable(),
  /** Small lines above the text, 0 to 4: sender, date, byline, address… */
  meta: z.array(LearningTextSchema).max(4),
  /**
   * The paragraphs, in reading order. A line break inside one starts a
   * new line (a menu line, a timetable row, a line of a poem).
   */
  paragraphs: z
    .array(z.string().trim().min(1).max(TEXT_LIMITS.long))
    .min(READING_LIMITS.paragraphs[0])
    .max(READING_LIMITS.paragraphs[1]),
  /**
   * The key words to highlight, main document only (empty for the exam
   * document). `text` is copied exactly from a paragraph, so it can be
   * found there.
   */
  highlights: z
    .array(z.strictObject({ keywordId: NestedIdSchema, text: LearningTextSchema }))
    .max(24),
});
export type ReadingDocument = z.infer<typeof ReadingDocumentSchema>;

/** The answer choices of a question, 3 to 4. */
const OptionsSchema = z
  .array(z.strictObject({ optionId: NestedIdSchema, text: LearningTextSchema }))
  .min(READING_LIMITS.options[0])
  .max(READING_LIMITS.options[1]);

/**
 * One item of a page. `type` says which of the seven it is. Unlike the
 * other kinds, no item has a translation, so this is a plain schema, not
 * a function of the course language.
 */
export const readingItemSchema = z.discriminatedUnion('type', [
  /** The key words as flashcards; their texts come from the brief. Nothing to correct. */
  z.strictObject({
    type: z.literal('reading_flashcards'),
    itemId: NestedIdSchema,
    keywordIds: z.array(NestedIdSchema).min(1),
  }),
  /** Match each meaning with its key word; the texts come from the brief. */
  z.strictObject({
    type: z.literal('reading_keyword_matching'),
    itemId: NestedIdSchema,
    keywordIds: z.array(NestedIdSchema).min(2),
  }),
  /**
   * Shows a document. `view` says how: skim (shown for skimSeconds, then
   * hidden), open (stays visible), exam (the exam document).
   */
  z.strictObject({
    type: z.literal('reading_document'),
    itemId: NestedIdSchema,
    documentId: z.enum(['main', 'exam']),
    view: z.enum(['skim', 'open', 'exam']),
    /** skim view: seconds before the document is hidden; null for the other views. */
    skimSeconds: z
      .number()
      .int()
      .min(READING_LIMITS.skimSeconds[0])
      .max(READING_LIMITS.skimSeconds[1])
      .nullable(),
  }),
  /** The skim question: one question on the whole document (SKIM_FOCUS), with choices. */
  z.strictObject({
    type: z.literal('reading_skim_choice'),
    itemId: NestedIdSchema,
    focus: z.enum(SKIM_FOCUS),
    question: LearningTextSchema,
    options: OptionsSchema,
    answerOptionId: NestedIdSchema,
    answerExplanation: LocalizedTextSchema,
  }),
  /** A question with choices; answerOptionId is the right one. */
  z.strictObject({
    type: z.literal('reading_choice'),
    itemId: NestedIdSchema,
    question: LearningTextSchema,
    options: OptionsSchema,
    answerOptionId: NestedIdSchema,
    answerExplanation: LocalizedTextSchema,
  }),
  /** A statement about the document: true or false? */
  z.strictObject({
    type: z.literal('reading_true_false'),
    itemId: NestedIdSchema,
    statement: LearningTextSchema,
    answer: z.enum(['true', 'false']),
    answerExplanation: LocalizedTextSchema,
  }),
  /**
   * Put pieces of information in the order the text gives them, like a
   * word order exercise with phrases instead of words. 1 or 2 right
   * orders, as lists of pieceIds.
   */
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

/**
 * One screen of the lesson. At most 6 items: the exam page is the
 * biggest, with the document and its 5 questions.
 */
const PageSchema = z.strictObject({
  pageId: NestedIdSchema,
  estimatedDurationS: DurationSecondsSchema,
  /** The exam's countdown: 1.5 × the page's estimate, rounded up to 5 s; null on every other page. */
  timeLimitS: TimeLimitSecondsSchema.nullable(),
  instructions: LocalizedTextSchema,
  items: z
    .array(readingItemSchema)
    .min(1)
    .max(1 + READING_LIMITS.examQuestions),
});

/**
 * The playable reading lesson: the same envelope as the brief, its two
 * documents, then exactly six steps of one page each (READING_STAGES).
 *
 * It takes the course language only so that all four kinds are called
 * the same way (see artifacts.ts); nothing here depends on it, hence
 * the `_` in `_lang`.
 */
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

/**
 * The words for "true" and "false" in each course language: they are
 * answer choices, so they are in the language being learned. No code
 * here reads them; the lesson player will (Milestone 3).
 */
export const TRUE_FALSE_LABELS: Record<string, Record<'true' | 'false', string>> = {
  fr: { true: 'Vrai', false: 'Faux' },
  de: { true: 'Richtig', false: 'Falsch' },
  en: { true: 'True', false: 'False' },
};
