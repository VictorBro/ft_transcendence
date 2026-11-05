import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { LanguageSchema, LessonCardSchema, LessonIdSchema, lessons } from '@ft/shared';
import type { Language, LessonCard } from '@ft/shared';

import { apiFind } from './api';
import { findCourse, requireCourses } from './courses';
import { lessonPath } from './lessons';

type AttemptRead = lessons.player.AttemptRead;

/** What the three lesson pages read: the card (title, chips, best score) and the attempt. */
export interface LessonData {
  lang: Language;
  id: string;
  card: LessonCard;
  read: AttemptRead;
}

/**
 * The guard and the two reads of the lesson pages (#146). In order:
 * - no session: /login (requireCourses);
 * - not a language, or not an id: 404;
 * - no course, or a course with no level: onboarding, as the course page;
 * - a lesson the course does not have, or one not ready: 404.
 * An API that does not answer throws, so the error page shows.
 */
export async function loadLesson(lang: string, id: string): Promise<LessonData> {
  const { courses } = await requireCourses();

  const parsedLang = LanguageSchema.safeParse(lang);
  const parsedId = LessonIdSchema.safeParse(id);
  if (!parsedLang.success || !parsedId.success) {
    notFound();
  }

  const course = findCourse(courses, parsedLang.data);
  if (course === null || course.level === null) {
    redirect(`/onboarding?lang=${parsedLang.data}`);
  }

  const { read, card } = await readLesson(parsedLang.data, parsedId.data);

  for (const result of [read, card]) {
    if (result.status === 'signed-out') redirect('/login');
    if (result.status === 'not-found') notFound();
    if (result.status === 'unavailable') {
      throw new Error(`Could not load the lesson: ${result.reason}`);
    }
  }
  if (read.status !== 'ok' || card.status !== 'ok') {
    // Unreachable: every other status left above. Narrows the types.
    notFound();
  }
  return { lang: parsedLang.data, id: parsedId.data, card: card.data, read: read.data };
}

/**
 * The two reads, memoised per request: the page and its metadata both ask.
 * The attempt route 404s on a lesson that is not ready; the card route does not.
 */
const readLesson = cache(async function readLesson(lang: Language, id: string) {
  const base = `/api/courses/${lang}/lessons/${id}`;
  const [read, card] = await Promise.all([
    apiFind(lessons.player.AttemptReadSchema, `${base}/attempt`),
    apiFind(LessonCardSchema, base),
  ]);
  return { read, card };
});

/**
 * The lesson's title for the tab, or null. No redirect and no 404 here:
 * the page decides those, and metadata must not race it.
 */
export async function lessonTitle(lang: string, id: string): Promise<string | null> {
  const parsedLang = LanguageSchema.safeParse(lang);
  const parsedId = LessonIdSchema.safeParse(id);
  if (!parsedLang.success || !parsedId.success) return null;
  const { card } = await readLesson(parsedLang.data, parsedId.data);
  return card.status === 'ok' ? card.data.title : null;
}

/** Where the lesson's three pages live. */
export function lessonPaths(lang: Language, id: string) {
  const page = lessonPath(lang, id);
  return { page, play: `${page}/play`, results: `${page}/results` };
}

/** Where the learner is in the lesson: what the lesson page offers. */
export type LessonStage = 'new' | 'running' | 'exam' | 'finished';

export function lessonStage(attempt: AttemptRead['attempt']): LessonStage {
  if (attempt === null) return 'new';
  if (attempt.current === null) return 'finished';
  return attempt.current.role === 'exam' ? 'exam' : 'running';
}
