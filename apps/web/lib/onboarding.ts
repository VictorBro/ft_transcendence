import type { Course, Language } from '@ft/shared';

/**
 * Which step of onboarding a learner is on, derived from the API rather than
 * held in React state: the step then survives a refresh, a back button and an
 * abandoned placement exam without handling any of them on its own.
 */
export type OnboardingStep =
  { step: 'chooseCourse'; preselected: Language | null } | { step: 'chooseLevel'; course: Course };

/**
 * `wanted` is the course the learner came from, so with two unplaced courses
 * they finish the one they clicked rather than the newest.
 */
export function resolveOnboardingStep(
  courses: readonly Course[],
  wanted: Language | null = null,
): OnboardingStep {
  const course = courses.find((candidate) => candidate.lang === wanted);

  if (wanted !== null && course === undefined) {
    return { step: 'chooseCourse', preselected: wanted };
  }
  if (course?.level === null) {
    return { step: 'chooseLevel', course };
  }

  const unfinished = courses.findLast((candidate) => candidate.level === null);

  return unfinished === undefined
    ? { step: 'chooseCourse', preselected: null }
    : { step: 'chooseLevel', course: unfinished };
}
