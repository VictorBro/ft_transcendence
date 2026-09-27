import {
  LanguageSchema,
  OPTIONS_PER_ITEM,
  PLACEMENT_ROUNDS,
  QuestionCategorySchema,
  SubmitAnswerSchema,
} from '@ft/shared';
import { z } from 'zod';

export const ExamSessionSchema = z.object({
  evalId: z.uuid(),
  lang: LanguageSchema,
  lo: z.number().int().min(0).max(6),
  hi: z.number().int().min(0).max(6),
  level: z.number().int().min(0).max(6).nullable(),
  mistakesPerLevel: z
    .number()
    .int()
    .min(0)
    .max(PLACEMENT_ROUNDS.maxMistakes + 1),
  askedPerCategory: z.record(
    QuestionCategorySchema,
    z.number().int().nonnegative().min(0).max(PLACEMENT_ROUNDS.perCategory),
  ),
  totalAnswered: z.number().int().nonnegative(),
  answers: z.array(SubmitAnswerSchema),
  ended: z.boolean(),
  currentQuestionId: z.string().nullable(),
  /** Shuffled once when served, so a reload shows the same order. */
  currentOptions: z.array(z.string().min(1)).length(OPTIONS_PER_ITEM).nullable(),
  servedAt: z.iso.datetime(),
});
export type ExamSession = z.infer<typeof ExamSessionSchema>;
