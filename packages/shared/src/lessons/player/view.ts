import { z } from 'zod';

import { FinishResultSchema, LessonIdSchema, LessonKindSchema } from '../../schemas/lesson';
import { LocaleSchema } from '../../schemas/locale';
import { SKIM_FOCUS } from '../schemas/reading';
import { GenderSchema } from '../schemas/vocabulary';
import { ANSWER_OUTCOMES } from './score';

/**
 * Everything of a lesson attempt the browser may see, as strict zod
 * schemas: the API parses each response with them before sending it, and
 * the web app parses what it receives. `z.strictObject` rejects any key
 * not listed here, so a key that slips into a view fails loudly instead
 * of reaching the learner.
 *
 * Two rules hold the keys back:
 * - **The keys only come after the lock.** Accepted answers, the right
 *   option or order, the faulty token and the explanations exist only in
 *   UnitFeedback (a practice page, once checked) and in Results (once the
 *   attempt is finished). PageView has none.
 * - **No authored id.** The ids of a lesson file carry answers
 *   (`gap-livre`, a unit ending in `/je`), so units, options, tokens and
 *   cards are named by a Ref instead: an HMAC of the internal id, valid
 *   in one attempt only (#145 computes it). A shuffled list is sorted by
 *   its refs, so its order says nothing either.
 *
 *   GET  attempt              → AttemptRead
 *   POST attempt              StartAttempt → AttemptView
 *   POST attempt/pages/:index SubmitPage   → PageResult
 */

/** 16 base64url characters: an HMAC of an internal id, valid in one attempt only. */
export const RefSchema = z.string().regex(/^[A-Za-z0-9_-]{16}$/);
export type Ref = z.infer<typeof RefSchema>;

/** A text in en, fr and de: the interface picks one. */
const Localized = z.strictObject({ en: z.string(), fr: z.string(), de: z.string() });
export type LocalizedTextView = z.infer<typeof Localized>;

/** A text in the course's native languages only (a French course: en and de). */
const Native = z.strictObject({
  en: z.string().optional(),
  fr: z.string().optional(),
  de: z.string().optional(),
});

/** How to render a text: in the course language, in the mother tongue, or as an interface message (a gender). */
export const TextLangSchema = z.enum(['learning', 'native', 'ui']);
export type TextLang = z.infer<typeof TextLangSchema>;

export const PageRoleSchema = z.enum([
  'presentation',
  'practice',
  'discussion',
  'examIntro',
  'exam',
]);
export const AnswerOutcomeSchema = z.enum(ANSWER_OUTCOMES);
export const ExamPartSchema = z.enum(['translation', 'replies', 'dialogue']);

/* ================================================================ outline */

/**
 * The lesson before and during an attempt: the start page, the outline
 * of the sidebar and the progress bar. The same for every learner; no
 * key, and never the genre of a reading lesson.
 */
export const LessonOutlineSchema = z.strictObject({
  lessonId: LessonIdSchema,
  kind: LessonKindSchema,
  title: z.string(),
  objective: Localized,
  minutes: z.number().int().positive(),
  /** The numbered learning points, by section; the exam section has none. */
  sections: z.array(
    z.strictObject({
      title: Localized,
      minutes: z.number().int().positive(),
      points: z.array(z.strictObject({ number: z.number().int().positive(), title: Localized })),
    }),
  ),
  /** Vocabulary: the number of words. */
  words: z.number().int().positive().optional(),
  /** Grammar: the verbs the lesson introduces. */
  newVerbs: z.array(z.strictObject({ infinitive: z.string(), translation: Native })).optional(),
  /** Functions and reading. */
  situation: Localized.optional(),
  /** Functions: the two roles of the dialogue. */
  roles: z.array(z.string()).optional(),
  /** Every page, in order: the progress bar and the exam info page read it. */
  pages: z.array(
    z.strictObject({
      role: PageRoleSchema,
      seconds: z.number().int().positive(),
      /** The countdown of an exam page; null elsewhere. */
      limitS: z.number().int().positive().nullable(),
      /** The number of answers on the page. */
      questions: z.number().int().nonnegative(),
      step: Localized,
    }),
  ),
});
export type LessonOutline = z.infer<typeof LessonOutlineSchema>;

/* ================================================================== units */

/** How a unit is asked, already in the attempt's languages. */
export const PromptSchema = z.strictObject({
  learning: z.string().optional(),
  native: z.string().optional(),
  before: z.string().optional(),
  after: z.string().optional(),
});
export type Prompt = z.infer<typeof PromptSchema>;

const TextUnit = z.strictObject({
  ref: RefSchema,
  kind: z.literal('text'),
  prompt: PromptSchema,
  /** Translation exam: the answer starts with an indefinite or a definite article, or with none. */
  article: z.enum(['indefinite', 'definite']).nullable().optional(),
});
const ChoiceUnit = z.strictObject({
  ref: RefSchema,
  kind: z.literal('choice'),
  prompt: PromptSchema,
  options: z.array(z.strictObject({ ref: RefSchema, text: z.string(), lang: TextLangSchema })),
  /** Course-language text the audio control reads aloud. */
  speak: z.string().optional(),
});
const Token = z.strictObject({ ref: RefSchema, text: z.string() });
const OrderUnit = z.strictObject({
  ref: RefSchema,
  kind: z.literal('order'),
  prompt: PromptSchema,
  tokens: z.array(Token),
});
const SpotUnit = z.strictObject({
  ref: RefSchema,
  kind: z.literal('spot'),
  prompt: PromptSchema,
  tokens: z.array(Token),
  correction: z.strictObject({ mode: z.enum(['type', 'select']), choices: z.array(z.string()) }),
});

/** One answer to give. Nothing in it tells the right one. */
export const UnitViewSchema = z.discriminatedUnion('kind', [
  TextUnit,
  ChoiceUnit,
  OrderUnit,
  SpotUnit,
]);
export type UnitView = z.infer<typeof UnitViewSchema>;

/* ================================================================== items */

/** An example sentence and its translation in the mother tongue. */
const Example = z.strictObject({ text: z.string(), translation: z.string() });
const units = <T extends z.ZodType>(unit: T) => ({ units: z.array(unit) });
const item = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.strictObject({ type: z.literal(type), ...shape });

/**
 * One item of a page, one schema per item type. A presentation item is
 * sent whole, since it teaches; an exercise is its units, and the texts
 * around them.
 */
export const ItemViewSchema = z.discriminatedUnion('type', [
  /* vocabulary */
  item('vocabulary_introduction', {
    text: Localized,
    words: z.array(z.strictObject({ text: z.string(), translations: z.array(z.string()) })),
  }),
  item('vocabulary_flashcards', {
    cards: z.array(
      z.strictObject({
        ref: RefSchema,
        /** The teaching form: un livre. */
        text: z.string(),
        translations: z.array(z.string()),
        pronunciation: z.string(),
        example: Example,
      }),
    ),
  }),
  item('vocabulary_matching', units(ChoiceUnit)),
  item('vocabulary_gender_select', units(ChoiceUnit)),
  item('vocabulary_typed_gap', {
    /** The four words shown as a hint, the answer among them. */
    references: z.array(
      z.strictObject({ ref: RefSchema, text: z.string(), genders: z.array(GenderSchema) }),
    ),
    ...units(TextUnit),
  }),
  item('vocabulary_translation_exam', units(TextUnit)),

  /* grammar */
  item('grammar_explanation', {
    heading: Localized,
    text: Localized,
    formTable: z.array(
      z.strictObject({ subject: z.string(), form: z.string(), example: z.string().nullable() }),
    ),
    examples: z.array(Example),
  }),
  item('grammar_person_matching', {
    mode: z.enum(['translation', 'forms']),
    ...units(ChoiceUnit),
  }),
  item('grammar_pronoun_form_match', units(ChoiceUnit)),
  item('grammar_pronoun_form_typing', units(TextUnit)),
  item('grammar_gap_choice', { hint: Localized.nullable(), ...units(ChoiceUnit) }),
  item('grammar_gap_typing', { hint: Localized.nullable(), ...units(TextUnit) }),
  item('grammar_word_order', units(OrderUnit)),
  item('grammar_error_spotter', units(SpotUnit)),

  /* functions */
  item('function_flashcards', {
    side: z.enum(['expressions', 'words']),
    cards: z.array(
      z.strictObject({
        ref: RefSchema,
        text: z.string(),
        translations: z.array(z.string()),
        /** An expression: when to use it. */
        explanation: Localized.optional(),
        /** A word: its genders, none for a word that is no noun. */
        genders: z.array(GenderSchema).optional(),
        example: Example,
      }),
    ),
  }),
  item('function_dialogue', {
    lines: z.array(
      z.strictObject({
        ref: RefSchema,
        role: z.string(),
        roleTranslation: z.string(),
        text: z.string(),
        translation: z.string(),
        note: Localized,
      }),
    ),
  }),
  item('function_gender_select', units(ChoiceUnit)),
  item('function_matching', { side: z.enum(['expressions', 'words']), ...units(ChoiceUnit) }),
  item('function_word_order', units(OrderUnit)),
  item('function_listening_choice', units(ChoiceUnit)),
  item('function_dialogue_gap_choice', units(ChoiceUnit)),
  item('function_translation_exam', units(TextUnit)),
  item('function_dialogue_gap_typing', {
    /** The exam dialogue; a line with a gap names its unit. */
    lines: z.array(
      z.strictObject({
        role: z.string(),
        before: z.string(),
        after: z.string(),
        translation: z.string(),
        gap: RefSchema.nullable(),
      }),
    ),
    ...units(TextUnit),
  }),

  /* reading */
  item('reading_flashcards', {
    cards: z.array(
      z.strictObject({ ref: RefSchema, text: z.string(), translations: z.array(z.string()) }),
    ),
  }),
  item('reading_keyword_matching', units(ChoiceUnit)),
  item('reading_document', {
    view: z.enum(['skim', 'open', 'exam']),
    /** Skim: how long the document stays open. */
    skimSeconds: z.number().int().positive().nullable(),
    document: z.strictObject({
      title: z.string().nullable(),
      meta: z.array(z.string()),
      paragraphs: z.array(z.string()),
      /** The key words to highlight, as they appear in the text. */
      highlights: z.array(z.string()),
    }),
  }),
  item('reading_skim_choice', { focus: z.enum(SKIM_FOCUS), ...units(ChoiceUnit) }),
  item('reading_choice', units(ChoiceUnit)),
  item('reading_true_false', units(ChoiceUnit)),
  item('reading_order', units(OrderUnit)),
]);
export type ItemView = z.infer<typeof ItemViewSchema>;
export type ItemViewType = ItemView['type'];

/* ================================================================== pages */

/** The page at the cursor. */
export const PageViewSchema = z.strictObject({
  index: z.number().int().nonnegative(),
  role: PageRoleSchema,
  /** Its answers count: practice and exam pages. */
  scored: z.boolean(),
  instructions: Localized,
  items: z.array(ItemViewSchema),
});
export type PageView = z.infer<typeof PageViewSchema>;

/** Points earned out of points possible. */
export const TallySchema = z.strictObject({
  earned: z.number().nonnegative(),
  possible: z.number().int().nonnegative(),
});

/** A part of a typed answer in the results; the wrong parts are shown in red. */
export const AnswerMarkSchema = z.strictObject({ text: z.string(), wrong: z.boolean() });

/* ================================================================ answers */

/**
 * One answer, by unit kind: typed text (with a gender after "des" + a
 * word), an option, the tokens in order, or the faulty token and its
 * correction.
 */
export const AnswerSchema = z.union([
  z.strictObject({ text: z.string().max(300), gender: GenderSchema.optional() }),
  z.strictObject({ option: RefSchema }),
  z.strictObject({ tokens: z.array(RefSchema).max(32) }),
  z.strictObject({ token: RefSchema, text: z.string().max(300) }),
]);
export type Answer = z.infer<typeof AnswerSchema>;

/** Start (or resume) an attempt; the locale fixes the mother tongue. */
export const StartAttemptSchema = z.strictObject({ locale: LocaleSchema });
export type StartAttempt = z.infer<typeof StartAttemptSchema>;

/** The answers of the cursor page, by unit ref; {} on a page with no units. */
export const SubmitPageSchema = z.strictObject({
  attemptId: z.uuid(),
  answers: z.record(RefSchema, AnswerSchema),
});
export type SubmitPage = z.infer<typeof SubmitPageSchema>;

/* =============================================================== feedback */

/** The correction of one unit: on a practice page once checked, and in the results. */
export const UnitFeedbackSchema = z.strictObject({
  ref: RefSchema,
  outcome: AnswerOutcomeSchema,
  points: z.union([z.literal(0), z.literal(0.5), z.literal(1)]),
  scored: z.boolean(),
  /** The teaching answer. */
  answer: z.string(),
  /** The accepted answer closest to the learner's, when it differs from `answer`. */
  accepted: z.string().optional(),
  explanation: Localized,
  marks: z.array(AnswerMarkSchema).optional(),
  /** Choice: the right options. */
  correct: z.array(RefSchema).optional(),
  /** Order: a right order. */
  order: z.array(RefSchema).optional(),
  /** Spot: the faulty token. */
  faulty: RefSchema.optional(),
  /** A gender row: the word's teaching form and translation. */
  form: z.string().optional(),
  translation: z.string().optional(),
});
export type UnitFeedback = z.infer<typeof UnitFeedbackSchema>;

/* ================================================================ results */

/** The finish block of the results: #82's daily goal, and the best score. #95 adds XP, challenge and achievements. */
export const ResultsFinishSchema = z.strictObject({
  ...FinishResultSchema.shape,
  best: z.number().int().min(0).max(100),
});

/** The results of a finished attempt. Every key is here: the attempt is over. */
export const ResultsSchema = z.strictObject({
  /** One decimal (78.3); LessonResult stores it rounded. */
  score: z.number().min(0).max(100),
  practice: TallySchema,
  exam: TallySchema,
  steps: z.array(
    z.strictObject({
      title: Localized,
      role: z.enum(['practice', 'exam']),
      part: ExamPartSchema.optional(),
      scored: z.boolean(),
      earned: z.number().nonnegative(),
      possible: z.number().int().nonnegative(),
    }),
  ),
  /** One row per unit, in page order. */
  rows: z.array(
    z.strictObject({
      /** Index into `steps`. */
      step: z.number().int().nonnegative(),
      prompt: PromptSchema,
      /** The learner's answer as text; null when blank. */
      yours: z.string().nullable(),
      gender: GenderSchema.optional(),
      answer: z.string(),
      accepted: z.string().optional(),
      outcome: AnswerOutcomeSchema,
      points: z.number().nonnegative(),
      scored: z.boolean(),
      timedOut: z.boolean(),
      /** In en, fr and de: the results page follows the interface language. */
      explanation: Localized,
      marks: z.array(AnswerMarkSchema).optional(),
    }),
  ),
  finish: ResultsFinishSchema,
});
export type Results = z.infer<typeof ResultsSchema>;

/* ================================================================ attempt */

/** An attempt as the learner sees it. */
export const AttemptViewSchema = z.strictObject({
  attemptId: z.uuid(),
  /** The page at the cursor; null once finished. */
  current: PageViewSchema.nullable(),
  /** Exam pages only: the time left; 0 means it ran out. */
  remainingMs: z.number().int().nonnegative().nullable(),
  /** The header score; the exam never moves it. */
  practice: TallySchema,
  /** Set once finished. */
  results: ResultsSchema.nullable(),
});
export type AttemptView = z.infer<typeof AttemptViewSchema>;

/** GET attempt: the outline, and the attempt (null before the first start). */
export const AttemptReadSchema = z.strictObject({
  outline: LessonOutlineSchema,
  attempt: AttemptViewSchema.nullable(),
});
export type AttemptRead = z.infer<typeof AttemptReadSchema>;

/** The answer to a submitted page: the feedback (practice pages only), then the attempt. */
export const PageResultSchema = z.strictObject({
  feedback: z.array(UnitFeedbackSchema).nullable(),
  attempt: AttemptViewSchema,
});
export type PageResult = z.infer<typeof PageResultSchema>;
