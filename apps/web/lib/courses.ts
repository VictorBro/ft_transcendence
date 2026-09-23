import { cache } from 'react';
import { CoursesSchema, type Course, type Courses, type Language } from '@ft/shared';

import { apiGet, type BaseResult } from './api';

/** Memoised per request: the header and the page body both ask. */
export const loadCourses = cache(async function loadCourses(): Promise<BaseResult<Courses>> {
  return apiGet(CoursesSchema, '/api/courses');
});

/** The course for a language, or null when the learner does not study it. */
export function findCourse(courses: Course[], lang: string): Course | null {
  return courses.find((course) => course.lang === lang) ?? null;
}

/**
 * Where /dashboard lands: this browser, then the server's memory for a second
 * device, then anything. Each is checked against the list, so a stale one falls
 * through. Null means onboarding.
 */
export function resolveLandingLang(
  cookieLang: string | undefined,
  activeLang: string | null,
  courses: Course[],
): Language | null {
  for (const candidate of [cookieLang, activeLang]) {
    const course =
      candidate === undefined || candidate === null ? null : findCourse(courses, candidate);
    if (course !== null) {
      return course.lang;
    }
  }
  return courses[0]?.lang ?? null;
}
