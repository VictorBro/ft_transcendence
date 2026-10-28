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
  ScoringPolicySchema,
  TimeLimitSecondsSchema,
} from './artifactCommon';
import { TopicSchema } from '../../schemas/item';
import type { Language } from '../../schemas/language';

/**
 * The schemas of a grammar lesson: one point of grammar, such as
 * "negation with ne… pas".
 *
 * A grammar lesson is two files with the same id. The brief is the plan:
 * the rules, the teaching blocks, which exercises each block has and how
 * many items. The content file is the playable lesson written from that
 * plan, item by item.
 *
 * content/briefs/fr-negation-ne-pas.json   content/lessons/fr-negation-ne-pas.json
 * ┌─────────────────────────────────┐      ┌─────────────────────────────────┐
 * │ ENVELOPE, kind, topic           │      │ ENVELOPE, kind, topic           │
 * ├─────────────────────────────────┤      ├─────────────────────────────────┤
 * │ rules   ── what is taught       │      │ steps, in this order:           │
 * │ blocks  ── 2 to 4, each:        │  →   │  per block: explanation,        │
 * │   explanation plan, examples,   │      │    then one step per exercise   │
 * │   exercises (type, itemCount)   │      │  feedback (a fixed page)        │
 * │ feedbackPlaceholder             │      │  exam                           │
 * │ exam.pages (type, itemCount)    │      │ each step: pages → items        │
 * └─────────────────────────────────┘      └─────────────────────────────────┘
 *
 * Every item and exercise names the rules it practises (ruleIds).
 * ../validation/ checks that the content follows the brief exactly: same
 * steps, same item types and counts, every rule taught and examined.
 *
 * The length rules (GRAMMAR_LENGTH) are not part of validateBrief and
 * validateContent: grammarBriefLengthIssues and grammarContentLengthIssues
 * check them, and validateLesson calls both.
 */

/** The seven kinds of exercise a grammar lesson can use. */
export const GRAMMAR_EXERCISE_TYPES = [
  'grammar_person_matching',
  'grammar_pronoun_form_match',
  'grammar_pronoun_form_typing',
  'grammar_gap_choice',
  'grammar_gap_typing',
  'grammar_word_order',
  'grammar_error_spotter',
] as const;
export const GrammarExerciseTypeSchema = z.enum(GRAMMAR_EXERCISE_TYPES);
export type GrammarExerciseType = z.infer<typeof GrammarExerciseTypeSchema>;

/**
 * The exercises that drill one form per person (je suis, tu es…). They
 * only make sense for a topic in PRONOUN_FORM_TOPICS; a lesson on
 * articles, negation or questions uses gaps and word order instead.
 * Checked in ../validation/.
 */
export const PRONOUN_FORM_TYPES: readonly GrammarExerciseType[] = [
  'grammar_person_matching',
  'grammar_pronoun_form_match',
  'grammar_pronoun_form_typing',
];
export const PRONOUN_FORM_TOPICS = ['pronouns', 'verbs_morphology', 'verb_usage'] as const;
/**
 * A lesson on one of these topics must have a grammar_person_matching
 * exercise. Not in English verbs_morphology: the English verb barely
 * changes with the person (I am, you are… I play, you play).
 */
export const PERSON_MATCHING_TOPICS: Record<Language, readonly string[]> = {
  fr: ['pronouns', 'verbs_morphology'],
  de: ['pronouns', 'verbs_morphology'],
  en: ['pronouns'],
};
/**
 * …except these lessons, too few persons for a board: the French
 * imperative (tu, nous, vous), the German one (du, ihr; Sie). German Sie
 * needs no person of its own: it uses the 3pl form. Holds outline ids.
 */
export const PERSON_MATCHING_EXEMPT: Record<Language, readonly string[]> = {
  fr: ['fr-imperative-mood'],
  de: ['de-imperative-du-ihr', 'de-imperative-sie'],
  en: [],
};

/**
 * The six grammatical persons, in the order they are shown: singular
 * (I, you, he/she), then plural (we, you, they).
 */
export const PERSONS = ['1sg', '2sg', '3sg', '1pl', '2pl', '3pl'] as const;
export const PersonSchema = z.enum(PERSONS);

/**
 * How long a grammar lesson must be. A "scored unit" is one answer
 * graded: one item, or one row for an item made of rows. Pairs are
 * [min, max].
 * - minPracticeUnits, minExamUnits: at least 22 answers in the exercises
 *   and 10 in the exam;
 * - examPages: 2 to 4 exam pages;
 * - exercisesPerBlock: 2 to 4 exercises per teaching block;
 * - secondsPerUnit: a page's estimated duration divided by its units,
 *   6 to 40 seconds;
 * - explanationSeconds: an explanation page takes 45 to 240 seconds.
 * Only exercisesPerBlock[1] is a schema limit; grammarBriefLengthIssues
 * and grammarContentLengthIssues in ../validation/ check the rest.
 */
export const GRAMMAR_LENGTH = {
  minPracticeUnits: 22,
  minExamUnits: 10,
  examPages: [2, 4],
  exercisesPerBlock: [2, 4],
  secondsPerUnit: [6, 40],
  explanationSeconds: [45, 240],
} as const;

/**
 * The exercise types allowed in the exam: the learner writes the answer
 * (types it or puts the words in order), nothing to pick from a list.
 */
export const GRAMMAR_EXAM_TYPES = [
  'grammar_gap_typing',
  'grammar_pronoun_form_typing',
  'grammar_word_order',
] as const;

/* =================================================================== brief */

/** An example sentence in the language being learned, with its translations. */
export const exampleSchema = (lang: string) =>
  z.strictObject({ text: LearningTextSchema, translation: nativeTextSchema(lang) });

/**
 * The plan of a grammar lesson: content/briefs/<id>.json. A function of
 * the course language, for the translations.
 *
 * ../validation/ checks that every id is unique, every ruleId names a
 * rule of `rules`, every rule is taught by a block and covered by the
 * exam, and estimatedMinutes is the sum of the planned durations.
 */
export const grammarBriefSchema = (lang: string) =>
  z.strictObject({
    ...envelopeShape,
    kind: z.literal('grammar'),
    topic: TopicSchema,
    /** What the lesson covers and what it leaves out. For the reviewer. */
    scopeBoundaries: LocalizedTextSchema,
    /** For the reviewer. */
    prerequisites: z.array(LocalizedTextSchema).max(4),
    /** The rules taught, 1 to 12. Blocks, exercises and items point to them by id. */
    rules: z
      .array(z.strictObject({ id: NestedIdSchema, summary: LocalizedTextSchema }))
      .min(1)
      .max(12),
    /**
     * The teaching blocks, 2 to 4. A block teaches some rules: an
     * explanation page (written from explanationPlan, shown for
     * explanationDurationS), then its exercises in order.
     */
    blocks: z
      .array(
        z.strictObject({
          id: NestedIdSchema,
          title: LocalizedLabelSchema,
          ruleIds: z.array(NestedIdSchema).min(1),
          /** What the explanation page must say. */
          explanationPlan: LocalizedLongTextSchema,
          explanationDurationS: DurationSecondsSchema,
          examples: z.array(exampleSchema(lang)).min(1).max(8),
          /** Common mistakes to warn about. */
          pitfalls: z.array(LocalizedTextSchema).max(4),
          /**
           * The block's exercises: which type, how many items, which rules
           * they practise, how long. The content has one step per exercise
           * with exactly itemCount items of that type.
           */
          exercises: z
            .array(
              z.strictObject({
                id: NestedIdSchema,
                type: GrammarExerciseTypeSchema,
                itemCount: z.number().int().min(1).max(12),
                ruleIds: z.array(NestedIdSchema).min(1),
                estimatedDurationS: DurationSecondsSchema,
              }),
            )
            .min(1)
            .max(GRAMMAR_LENGTH.exercisesPerBlock[1]),
        }),
      )
      .min(2)
      .max(4),
    /**
     * Verbs the lesson uses that no earlier vocabulary lesson taught: the
     * infinitive and its translations, shown at the start of the lesson.
     */
    newVerbs: z
      .array(
        z.strictObject({ infinitive: LearningTextSchema, translations: nativeTextSchema(lang) }),
      )
      .max(12),
    /**
     * A fixed page before the exam that will one day give the learner
     * feedback on what they wrote. Only its duration is planned here.
     */
    feedbackPlaceholder: z.strictObject({ estimatedDurationS: DurationSecondsSchema }),
    /**
     * The exam, page by page: the exercise type, how many items, the
     * rules covered, the duration and the countdown (timeLimitS).
     */
    exam: z.strictObject({
      pages: z
        .array(
          z.strictObject({
            pageId: NestedIdSchema,
            type: z.enum(GRAMMAR_EXAM_TYPES),
            itemCount: z.number().int().min(1).max(12),
            ruleIds: z.array(NestedIdSchema).min(1),
            estimatedDurationS: DurationSecondsSchema,
            timeLimitS: TimeLimitSecondsSchema,
          }),
        )
        .min(1)
        .max(20),
    }),
    scoring: ScoringPolicySchema,
  });
export type GrammarBrief = z.infer<ReturnType<typeof grammarBriefSchema>>;

/* ================================================================= content */

/*
 * The playable grammar lesson: content/lessons/<id>.json, written from
 * the brief. A lesson is a list of steps, a step a list of pages, and a
 * page a list of items (an explanation or an exercise).
 */

/**
 * One word or punctuation mark of a sentence the learner rearranges or
 * clicks. Each has its own id, so the same word can appear twice.
 */
const TokenSchema = z.strictObject({ tokenId: NestedIdSchema, text: LearningTextSchema });

/**
 * The fields of an exercise with one answer: the rules it practises and
 * the text shown when it is corrected. Spread into the exercises below
 * (`...scored`).
 */
const scored = { ruleIds: z.array(NestedIdSchema).min(1), answerExplanation: LocalizedTextSchema };

/**
 * One item of a page. `type` says which of the nine it is, and each type
 * has its own fields: the explanation, the feedback page, and the seven
 * exercises of GRAMMAR_EXERCISE_TYPES.
 */
export const grammarItemSchema = (lang: string) =>
  z.discriminatedUnion('type', [
    /**
     * The explanation of a block: a heading, a text in simple Markdown
     * (like a vocabulary group's introduction), an optional table of
     * forms (je → suis) and examples. Nothing to answer.
     */
    z.strictObject({
      type: z.literal('grammar_explanation'),
      itemId: NestedIdSchema,
      ruleIds: z.array(NestedIdSchema).min(1),
      heading: LocalizedLabelSchema,
      text: LocalizedLongTextSchema,
      formTable: z
        .array(
          z.strictObject({
            subject: LearningTextSchema,
            form: LearningTextSchema,
            example: LearningTextSchema.nullable(),
          }),
        )
        .max(12),
      examples: z.array(exampleSchema(lang)).max(8),
    }),
    /** The fixed feedback page before the exam (feedbackPlaceholder in the brief). */
    z.strictObject({ type: z.literal('production_feedback_placeholder'), itemId: NestedIdSchema }),
    /**
     * Match each person with its answer, one row per person: the three
     * singular rows, then the three plural ones (only three rows when the
     * lesson teaches one of the two). Two modes:
     * - translation: the pronoun in the learner's language → in the
     *   language being learned (he → il);
     * - forms: the pronoun → the verb form (je → suis).
     */
    z.strictObject({
      type: z.literal('grammar_person_matching'),
      itemId: NestedIdSchema,
      ruleIds: z.array(NestedIdSchema).min(1),
      mode: z.enum(['translation', 'forms']),
      rows: z
        .array(
          z.strictObject({
            person: PersonSchema,
            /** forms mode: the pronoun on the left (je); null in translation mode. */
            pronoun: LearningTextSchema.nullable(),
            /** translation mode: the pronoun in the learner's language on the left (I); null in forms mode. */
            native: nativeTextSchema(lang).nullable(),
            /** The right side: the pronoun (translation mode) or the verb form (forms mode). */
            answer: LearningTextSchema,
            answerExplanation: LocalizedTextSchema,
          }),
        )
        .min(3)
        .max(6),
    }),
    /** Drag the right form next to each pronoun: je → suis. */
    z.strictObject({
      type: z.literal('grammar_pronoun_form_match'),
      itemId: NestedIdSchema,
      ruleIds: z.array(NestedIdSchema).min(1),
      /** The forms to drag; the same text may appear twice, with two ids. */
      tokens: z.array(TokenSchema).min(2).max(12),
      rows: z
        .array(
          z.strictObject({
            rowId: NestedIdSchema,
            pronoun: LearningTextSchema,
            validForms: z.array(LearningTextSchema).min(1),
            answerExplanation: LocalizedTextSchema,
          }),
        )
        .min(1)
        .max(8),
    }),
    /** Type the right form next to each pronoun. */
    z.strictObject({
      type: z.literal('grammar_pronoun_form_typing'),
      itemId: NestedIdSchema,
      ruleIds: z.array(NestedIdSchema).min(1),
      rows: z
        .array(
          z.strictObject({
            rowId: NestedIdSchema,
            pronoun: LearningTextSchema,
            accepted: AcceptedAnswersSchema,
            answerExplanation: LocalizedTextSchema,
          }),
        )
        .min(1)
        .max(8),
    }),
    /** A sentence with a gap: pick the missing word among four choices. */
    z.strictObject({
      type: z.literal('grammar_gap_choice'),
      itemId: NestedIdSchema,
      before: z.string().max(200),
      after: z.string().max(200),
      choices: z
        .array(z.strictObject({ choiceId: NestedIdSchema, text: LearningTextSchema }))
        .length(4),
      /** The choiceId of the right choice. */
      answerChoiceId: NestedIdSchema,
      /** A clue shown above the sentence ("plural, definite article"); null for none. */
      hint: LocalizedTextSchema.nullable(),
      ...scored,
    }),
    /** A sentence with a gap: type the missing word. */
    z.strictObject({
      type: z.literal('grammar_gap_typing'),
      itemId: NestedIdSchema,
      before: z.string().max(200),
      after: z.string().max(200),
      accepted: AcceptedAnswersSchema,
      /** A clue, in the exercises only: always null in the exam. */
      hint: LocalizedTextSchema.nullable(),
      ...scored,
    }),
    /** Put the words of a sentence in order. */
    z.strictObject({
      type: z.literal('grammar_word_order'),
      itemId: NestedIdSchema,
      /** The words, in the mixed order shown; punctuation marks are words too. */
      tokens: z.array(TokenSchema).min(2).max(16),
      /** Every right order, as lists of tokenIds, 1 to 4. */
      acceptedOrders: z.array(z.array(NestedIdSchema).min(2)).min(1).max(4),
      ...scored,
    }),
    /** A sentence with one wrong word: click it, then correct it. */
    z.strictObject({
      type: z.literal('grammar_error_spotter'),
      itemId: NestedIdSchema,
      tokens: z.array(TokenSchema).min(2).max(16),
      /** The tokenId of the wrong word. */
      faultyTokenId: NestedIdSchema,
      /** How the learner corrects it: types the word, or picks it from `choices`. */
      correction: z.strictObject({
        mode: z.enum(['type', 'select']),
        accepted: AcceptedAnswersSchema,
        /** select mode: 2 to 4 choices, a right one included; type mode: empty. */
        choices: z.array(LearningTextSchema).max(4),
      }),
      ...scored,
    }),
  ]);
export type GrammarItem = z.infer<ReturnType<typeof grammarItemSchema>>;

/**
 * One screen of the lesson: an instruction and 1 to 12 items.
 * timeLimitS is the exam's countdown, equal to the brief's; null on
 * every other page.
 */
const pageSchema = (lang: string) =>
  z.strictObject({
    pageId: NestedIdSchema,
    estimatedDurationS: DurationSecondsSchema,
    timeLimitS: TimeLimitSecondsSchema.nullable(),
    instructions: LocalizedTextSchema,
    items: z.array(grammarItemSchema(lang)).min(1).max(12),
  });

/**
 * The playable grammar lesson: the same envelope as the brief, then its
 * steps, in the order the brief sets: for each block an explanation step
 * and one exercise step per planned exercise, then the feedback step,
 * then the exam step. 6 to 20 steps.
 */
export const grammarContentSchema = (lang: string) =>
  z.strictObject({
    ...envelopeShape,
    kind: z.literal('grammar'),
    topic: TopicSchema,
    steps: z
      .array(
        z.strictObject({
          id: NestedIdSchema,
          role: z.enum(['explanation', 'exercise', 'feedback', 'exam']),
          /** The block an explanation or exercise step belongs to; null for feedback and exam. */
          blockId: NestedIdSchema.nullable(),
          label: LocalizedLabelSchema,
          pages: z.array(pageSchema(lang)).min(1).max(20),
        }),
      )
      .min(6)
      .max(20),
  });
export type GrammarContent = z.infer<ReturnType<typeof grammarContentSchema>>;
