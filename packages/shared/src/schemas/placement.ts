import { z } from 'zod';

import { LevelSchema, OPTIONS_PER_ITEM, QuestionCategorySchema, TargetLevelSchema } from './item';
import { LanguageSchema } from './language';

/** The exam that decides a course's level. Questions come from content/items/*.json. */

export const StartPlacementSchema = z.object({
  lang: LanguageSchema,
});
export type StartPlacementInput = z.infer<typeof StartPlacementSchema>;

/** A level is `perCategory` times the three QUESTION_CATEGORIES, and the second mistake ends it. */
export const PLACEMENT_ROUNDS = { perCategory: 2, maxMistakes: 1 } as const;

/**
 * One question, as the browser receives it. The QuestionBank row it is built
 * from carries `answer`, so `.strict()` makes a payload that still has it fail
 * the parse: the leak becomes a loud error instead of a silently stripped field.
 */
export const PlacementQuestionSchema = z
  .strictObject({
    questionId: z.uuid(),
    category: QuestionCategorySchema,
    level: LevelSchema,
    question: z.string().min(1),
    readText: z.string().min(1).nullable().optional(),
    options: z.array(z.string().min(1)).length(OPTIONS_PER_ITEM),
    /** Two clocks, so a reload resumes the countdown instead of restarting it. */
    timeLimitS: z.number().int().positive(),
    remainingS: z.number().int().min(0),
    /** `answered` doubles as this question's index, counting from zero. */
    progress: z.object({
      answered: z.number().int().min(0),
      maxRemaining: z.number().int().positive(),
    }),
  })
  .refine((q) => (q.category === 'reading' ? q.readText != null : q.readText == null), {
    message: 'reading questions need a readText, other categories must not have one',
    path: ['readText'],
  });
export type PlacementQuestion = z.infer<typeof PlacementQuestionSchema>;

/** Nullable but not optional: null is a timeout, scored wrong; absent is a broken client. */
export const SubmitAnswerSchema = z.object({
  questionId: z.uuid(),
  choice: z.string().min(1).nullable(),
});
export type SubmitAnswerInput = z.infer<typeof SubmitAnswerSchema>;

/** One line of the debrief, and the only place an answer is published. */
export const PlacementReportEntrySchema = z.object({
  questionId: z.uuid(),
  question: z.string().min(1),
  options: z.array(z.string().min(1)).length(OPTIONS_PER_ITEM),
  chosen: z.string().min(1).nullable(),
  correct: z.string().min(1),
  wasCorrect: z.boolean(),
});
export type PlacementReportEntry = z.infer<typeof PlacementReportEntrySchema>;

/** The verdict, with the answers it was drawn from. */
export const PlacementResultSchema = z.object({
  targetLevel: TargetLevelSchema,
  targetLevel: TargetLevelSchema.nullable(),
  report: z.array(PlacementReportEntrySchema),
});
export type PlacementResult = z.infer<typeof PlacementResultSchema>;

export const ExamSessionSchema = z.object({
  evalId: z.uuid(),
  lang: LanguageSchema,
  lo: TargetLevelSchema,
  hi: TargetLevelSchema,
  level: TargetLevelSchema.nullable(),
  mistakesPerLevel: z
    .number()
    .int()
    .nonnegative()
    .min(0)
    .max(PLACEMENT_ROUNDS.maxMistakes + 1),
  askedPerCategory: z.record(
    QuestionCategorySchema,
    z.int().nonnegative().min(0).max(PLACEMENT_ROUNDS.perCategory),
  ),
  totalAnswered: z.number().int().nonnegative(),
  ended: z.boolean(),
  currentQuestionId: z.string().nullable(),
  servedAt: z.iso.datetime(),
});
export type ExamSession = z.infer<typeof ExamSessionSchema>;
