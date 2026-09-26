/** Browser half of the courses API, like auth-client.ts. */
import { CourseSchema, type Course, type Language } from '@ft/shared';

import { clientPatch, clientPost, type ApiResult } from '@/lib/api-client';

export function startCourse(input: unknown): Promise<ApiResult<Course>> {
  return clientPost(CourseSchema, '/api/courses', input);
}

/** The endpoint the placement exam also calls: the level has one writer. */
export function setCourseLevel(lang: Language, input: unknown): Promise<ApiResult<Course>> {
  return clientPatch(CourseSchema, `/api/courses/${lang}/level`, input);
}
