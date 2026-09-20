import { describe, expect, it } from 'vitest';

import { learnPathLang } from './course-path';
import { findCourse, resolveLandingLang } from './courses';

const de = { lang: 'de', level: 'B1', dailyGoal: 30 } as const;
const fr = { lang: 'fr', level: null, dailyGoal: 10 } as const;
const courses = [de, fr];

describe('findCourse', () => {
  it('finds the course for a language the learner studies', () => {
    expect(findCourse([...courses], 'fr')).toEqual(fr);
  });

  // The page offers to start the course instead of 404ing, so this has to be
  // null rather than a throw.
  it('returns null for a language the learner does not study', () => {
    expect(findCourse([...courses], 'en')).toBeNull();
  });
});

describe('resolveLandingLang', () => {
  it('prefers the cookie, which is what this browser last opened', () => {
    expect(resolveLandingLang('fr', 'de', [...courses])).toBe('fr');
  });

  it('falls back to activeLang when there is no cookie, e.g. a second device', () => {
    expect(resolveLandingLang(undefined, 'de', [...courses])).toBe('de');
  });

  // A learner who started a course but never finished onboarding has no
  // activeLang, because only the PATCH routes write it.
  it('falls back to the first course when neither is set', () => {
    expect(resolveLandingLang(undefined, null, [...courses])).toBe('de');
  });

  // Otherwise dropping a course would route the learner at a page that tells
  // them they do not study it.
  it('ignores a cookie naming a course the learner no longer studies', () => {
    expect(resolveLandingLang('es', 'fr', [...courses])).toBe('fr');
  });

  it('has nowhere to land when there are no courses', () => {
    expect(resolveLandingLang('de', 'de', [])).toBeNull();
  });
});

describe('learnPathLang', () => {
  it.each([
    ['/en/learn/de', 'de'],
    ['/fr/learn/de/placement', 'de'],
    ['/learn/en', 'en'],
  ])('reads the learning language out of %s', (path, expected) => {
    expect(learnPathLang(path)).toBe(expected);
  });

  // The locale prefix is a two-letter segment too, so a path with no /learn in
  // it must not be mistaken for one.
  it.each(['/en/dashboard', '/en/profile/edit', '/de', '/'])('returns null for %s', (path) => {
    expect(learnPathLang(path)).toBeNull();
  });
});
