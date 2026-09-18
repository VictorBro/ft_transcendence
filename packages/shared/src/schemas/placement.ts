import { z } from 'zod';

import { LevelSchema, OPTIONS_PER_ITEM, QuestionCategorySchema } from './item';
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
  .object({
    questionId: z.uuid(),
    category: QuestionCategorySchema,
    level: LevelSchema,
    question: z.string().min(1),
    readText: z.string().min(1).optional(),
    options: z.array(z.string().min(1)).length(OPTIONS_PER_ITEM),
    /** Two clocks, so a reload resumes the countdown instead of restarting it. */
    timeLimitS: z.number().int().positive(),
    remainingS: z.number().int().min(0),
    /** `answered` doubles as this question's index, counting from zero. */
    progress: z.object({
      answered: z.number().int().min(0),
      total: z.number().int().positive(),
    }),
  })
  .strict();
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
  chosen: z.string().min(1).nullable(),
  correct: z.string().min(1),
  wasCorrect: z.boolean(),
});
export type PlacementReportEntry = z.infer<typeof PlacementReportEntrySchema>;

/** The verdict, with the answers it was drawn from. */
export const PlacementResultSchema = z.object({
  level: LevelSchema,
  report: z.array(PlacementReportEntrySchema),
});
export type PlacementResult = z.infer<typeof PlacementResultSchema>;

export const ExamSessionSchema = z.object({
  lang: LanguageSchema,
  lo: LevelSchema,
  hi: LevelSchema,
  level: LevelSchema,
  mistakesPerLevel: z.number().int().nonnegative().min(0).max(2),
  askedPerCategory: z.record(
    QuestionCategorySchema,
    z.int().nonnegative().min(0).max(PLACEMENT_ROUNDS.perCategory),
  ),
  total_asked: z.number().int().nonnegative(),
  currentQuestionId: z.string().nullable(),
  servedAt: z.iso.datetime(),
});
export type ExamSession = z.infer<typeof ExamSessionSchema>;
