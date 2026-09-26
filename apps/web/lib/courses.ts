import { redirect } from 'next/navigation';
import { cache } from 'react';
import { CoursesSchema, type Course, type Courses, type Language } from '@ft/shared';

import { apiGet, type BaseResult } from './api';

/** Memoised per request: the header and the page body both ask. */
export const loadCourses = cache(async function loadCourses(): Promise<BaseResult<Courses>> {
  return apiGet(CoursesSchema, '/api/courses');
});

/**
 * requireUser for pages that need the courses: this read answers the session
 * question too. An unavailable API throws, since a redirect reads as a logout.
 */
export async function requireCourses(): Promise<Courses> {
  const result = await loadCourses();

  if (result.status === 'signed-out') {
    redirect('/login');
  }

  if (result.status === 'unavailable') {
    throw new Error(`Could not load the courses: ${result.reason}`);
  }
  return result.data;
}

/** The course for a language, or null when the learner does not study it. */
export function findCourse(courses: Course[], lang: string): Course | null {
  return courses.find((course) => course.lang === lang) ?? null;
}

/**
 * Where /learn lands: this browser, then the server's memory for a second
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

/** Straight to the course when it can open, else to the onboarding step it lacks. */
export function landingPath(
  cookieLang: string | undefined,
  { courses, activeLang }: Courses,
): string {
  const lang = resolveLandingLang(cookieLang, activeLang, courses);

  if (lang === null) {
    return '/onboarding';
  }
  return findCourse(courses, lang)?.level === null ? `/onboarding?lang=${lang}` : `/learn/${lang}`;
}
