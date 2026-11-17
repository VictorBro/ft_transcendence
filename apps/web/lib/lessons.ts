import {
  LessonPageSchema,
  TodaySchema,
  type Language,
  type LessonPage,
  type LessonQuery,
  type Today,
} from '@ft/shared';

import { apiGet } from './api';
import { lessonQueryParams } from './lesson-list';

/**
 * GET /api/courses/:lang/today, once per course page. Like requireCourses, an
 * unavailable API throws, so the error page shows instead of an empty day. A
 * 401 here means the session ended between the two reads: back to /login.
 */
export async function loadToday(lang: Language): Promise<Today | 'signed-out'> {
  const result = await apiGet(TodaySchema, `/api/courses/${lang}/today`);

  if (result.status === 'unavailable') {
    throw new Error(`Could not load today's lessons: ${result.reason}`);
  }
  return result.status === 'signed-out' ? 'signed-out' : result.data;
}

/** GET /api/courses/:lang/lessons, once per all lessons page. Fails like loadToday. */
export async function loadLessonPage(
  lang: Language,
  query: LessonQuery,
): Promise<LessonPage | 'signed-out'> {
  const result = await apiGet(
    LessonPageSchema,
    `/api/courses/${lang}/lessons`,
    lessonQueryParams(query),
  );

  if (result.status === 'unavailable') {
    throw new Error(`Could not load the lessons: ${result.reason}`);
  }
  return result.status === 'signed-out' ? 'signed-out' : result.data;
}

/** Where a lesson opens: the lesson page of #146. */
export function lessonPath(lang: Language, id: string): string {
  return `/learn/${lang}/lessons/${id}`;
}
