import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Courses, lessons } from '@ft/shared';

/*
 * The guard of the lesson pages. Next's notFound() and redirect() throw, so
 * the mocks throw too, with what they were given.
 */
const notFound = vi.fn(() => {
  throw new Error('NOT_FOUND');
});
const redirect = vi.fn((to: string) => {
  throw new Error(`REDIRECT ${to}`);
});
vi.mock('next/navigation', () => ({ notFound, redirect }));

const requireCourses = vi.fn<() => Promise<Courses>>();
vi.mock('./courses', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./courses')>()),
  requireCourses,
}));

const apiFind = vi.fn();
vi.mock('./api', () => ({ apiFind }));

const { lessonPaths, lessonStage, lessonTitle, loadLesson } = await import('./lesson');

type AttemptView = lessons.player.AttemptView;

const COURSES: Courses = {
  activeLang: 'fr',
  courses: [
    { lang: 'fr', level: 'A1', dailyGoal: 10 },
    { lang: 'de', level: null, dailyGoal: 10 },
  ],
} as Courses;

const CARD = { id: 'fr-subject-pronouns', title: 'Les pronoms sujets' };
const READ = { outline: {}, attempt: null };

/** The two reads in order: the attempt, then the card. */
function reads(read: unknown, card: unknown) {
  apiFind.mockImplementation(async (_schema: unknown, path: string) =>
    path.endsWith('/attempt') ? read : card,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireCourses.mockResolvedValue(COURSES);
});

describe('loadLesson', () => {
  it('returns the card and the attempt read', async () => {
    reads({ status: 'ok', data: READ }, { status: 'ok', data: CARD });
    await expect(loadLesson('fr', 'fr-subject-pronouns')).resolves.toEqual({
      lang: 'fr',
      id: 'fr-subject-pronouns',
      card: CARD,
      read: READ,
    });
    expect(apiFind).toHaveBeenCalledWith(
      expect.anything(),
      '/api/courses/fr/lessons/fr-subject-pronouns/attempt',
    );
  });

  it('404s a wrong language or id, and a lesson that is not there or not ready', async () => {
    await expect(loadLesson('xx', 'fr-a')).rejects.toThrow('NOT_FOUND');
    await expect(loadLesson('fr', 'Not An Id')).rejects.toThrow('NOT_FOUND');
    reads({ status: 'not-found' }, { status: 'ok', data: CARD });
    await expect(loadLesson('fr', 'fr-not-ready')).rejects.toThrow('NOT_FOUND');
  });

  it('sends a course with no level, or none, to onboarding', async () => {
    await expect(loadLesson('de', 'de-a')).rejects.toThrow('REDIRECT /onboarding?lang=de');
    await expect(loadLesson('en', 'en-a')).rejects.toThrow('REDIRECT /onboarding?lang=en');
  });

  it('sends a session that ended to /login, and throws when the API is away', async () => {
    reads({ status: 'signed-out' }, { status: 'ok', data: CARD });
    await expect(loadLesson('fr', 'fr-a')).rejects.toThrow('REDIRECT /login');
    reads({ status: 'ok', data: READ }, { status: 'unavailable', reason: 'down' });
    await expect(loadLesson('fr', 'fr-a')).rejects.toThrow('Could not load the lesson: down');
  });
});

describe('lessonTitle', () => {
  it('is the card title, or null without one', async () => {
    reads({ status: 'ok', data: READ }, { status: 'ok', data: CARD });
    expect(await lessonTitle('fr', 'fr-subject-pronouns')).toBe('Les pronoms sujets');
    expect(await lessonTitle('fr', 'NOPE')).toBeNull();
    reads({ status: 'ok', data: READ }, { status: 'not-found' });
    expect(await lessonTitle('fr', 'fr-other')).toBeNull();
  });
});

describe('the lesson stage', () => {
  const view = (current: Partial<NonNullable<AttemptView['current']>> | null) =>
    ({ current }) as AttemptView;

  it('follows the attempt: none, a page, an exam page, finished', () => {
    expect(lessonStage(null)).toBe('new');
    expect(lessonStage(view({ role: 'practice' }))).toBe('running');
    expect(lessonStage(view({ role: 'examIntro' }))).toBe('running');
    expect(lessonStage(view({ role: 'exam' }))).toBe('exam');
    expect(lessonStage(view(null))).toBe('finished');
  });

  it('names the three pages', () => {
    expect(lessonPaths('fr', 'fr-a')).toEqual({
      page: '/learn/fr/lessons/fr-a',
      play: '/learn/fr/lessons/fr-a/play',
      results: '/learn/fr/lessons/fr-a/results',
    });
  });
});
