import { int, z } from 'zod';

export const ExamSessionSchema = z.object({
  evalId: z.uuid(),
  lang: LanguageSchema,
  lo: int().min(0).max(6),
  hi: int().min(0).max(6),
  level: int().min(0).max(6).nullable(),
  mistakesPerLevel: z
    .number()
    .int()
    .min(0)
    .max(PLACEMENT_ROUNDS.maxMistakes + 1),
  askedPerCategory: z.record(
    QuestionCategorySchema,
    z.int().nonnegative().min(0).max(PLACEMENT_ROUNDS.perCategory),
  ),
  totalAnswered: z.number().int().nonnegative(),
  answers: z.array(SubmitAnswerSchema),
  ended: z.boolean(),
  currentQuestionId: z.string().nullable(),
  servedAt: z.iso.datetime(),
});
export type ExamSession = z.infer<typeof ExamSessionSchema>;
