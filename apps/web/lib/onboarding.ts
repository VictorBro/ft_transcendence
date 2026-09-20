import { LEVELS, type Course, type Level } from '@ft/shared';

/**
 * What the course will teach: the level after the one the learner has reached.
 * C2 maps to itself, having nothing above it to aim at.
 */
export function nextLevel(level: Level): Level {
  const next = LEVELS[LEVELS.indexOf(level) + 1];

  return next === undefined ? level : next;
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
