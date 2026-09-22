import { LEVELS, type Course, type Level } from '@ft/shared';

/**
 * Not a CEFR level and never stored: how the picker says "nothing yet". It is
 * the only route to the A1 course, since every pick teaches the level above.
 */
export const BEGINNER = 'A0';

/** What a learner can claim to have mastered. Null is the beginner. */
export const MASTERY_OPTIONS = [null, ...LEVELS] as const;

/**
 * What the course will teach: the level after the one the learner has reached.
 * Null is a learner who has reached none, so their course is the first one. C2
 * maps to itself, having nothing above it to aim at.
 */
export function nextLevel(mastered: Level | null): Level {
  if (mastered === null) {
    return LEVELS[0];
  }
  const next = LEVELS[LEVELS.indexOf(mastered) + 1];

  return next === undefined ? mastered : next;
}

/**
 * Which step of onboarding a learner is on, derived from the API rather than
 * held in React state: the step then survives a refresh, a back button and an
 * abandoned placement exam without handling any of them on its own.
 */
export type OnboardingStep = { step: 'chooseCourse' } | { step: 'chooseLevel'; course: Course };

export function resolveOnboardingStep(courses: readonly Course[]): OnboardingStep {
  const unfinished = courses.findLast((course) => course.level === null);

  return unfinished === undefined
    ? { step: 'chooseCourse' }
    : { step: 'chooseLevel', course: unfinished };
}
