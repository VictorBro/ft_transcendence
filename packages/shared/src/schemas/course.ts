import { z } from 'zod';

import { LevelSchema } from './item';
import { LanguageSchema } from './language';

/** A learner's enrolment in one language: what they study, and at what pace. */

/** Minutes per day. A closed set, because each value is a button in the UI. */
export const DAILY_GOALS = [10, 30, 60] as const;
export const DailyGoalSchema = z.literal(DAILY_GOALS);
export type DailyGoal = z.infer<typeof DailyGoalSchema>;

export const CourseSchema = z.object({
  lang: LanguageSchema,
  /** Null until the placement exam decides one. */
  level: LevelSchema.nullable(),
  dailyGoal: DailyGoalSchema,
});
export type Course = z.infer<typeof CourseSchema>;

export const CoursesSchema = z.object({
  courses: z.array(CourseSchema),
  activeLang: LanguageSchema.nullable(),
});
export type Courses = z.infer<typeof CoursesSchema>;

/** No level here: only the placement exam sets it. */
export const StartCourseSchema = z.object({
  lang: LanguageSchema,
  dailyGoal: DailyGoalSchema,
});
export type StartCourseInput = z.infer<typeof StartCourseSchema>;

export const SetLevelSchema = z.object({ level: LevelSchema });
export type SetLevelInput = z.infer<typeof SetLevelSchema>;

export const SetGoalSchema = z.object({ dailyGoal: DailyGoalSchema });
export type SetGoalInput = z.infer<typeof SetGoalSchema>;
