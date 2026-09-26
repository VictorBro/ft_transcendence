import { describe, expect, it } from 'vitest';
import type { Course } from '@ft/shared';

import { nextLevel, resolveOnboardingStep } from './onboarding';

const course = (lang: Course['lang'], level: Course['level']): Course => ({
  lang,
  level,
  dailyGoal: 30,
});

describe('resolveOnboardingStep', () => {
  it('starts at the language choice when nothing is studied yet', () => {
    expect(resolveOnboardingStep([])).toEqual({ step: 'chooseCourse', preselected: null });
  });

  /** Where the refresh, the back button and the abandoned exam all arrive. */
  it('resumes at the level choice when a course has no level', () => {
    expect(resolveOnboardingStep([course('de', null)])).toEqual({
      step: 'chooseLevel',
      course: course('de', null),
    });
  });

  it('starts again at the language choice when every course has a level', () => {
    expect(resolveOnboardingStep([course('fr', 'B1'), course('de', 'A2')])).toEqual({
      step: 'chooseCourse',
      preselected: null,
    });
  });

  it('resumes the newest unfinished course, not the oldest', () => {
    expect(
      resolveOnboardingStep([course('de', null), course('fr', 'B1'), course('en', null)]),
    ).toEqual({ step: 'chooseLevel', course: course('en', null) });
  });
});

describe('resolveOnboardingStep for the course the learner came from', () => {
  it('opens the level choice for that course, not the newest unfinished one', () => {
    expect(resolveOnboardingStep([course('de', null), course('en', null)], 'de')).toEqual({
      step: 'chooseLevel',
      course: course('de', null),
    });
  });

  it('preselects a language the learner does not study yet', () => {
    expect(resolveOnboardingStep([course('de', null)], 'fr')).toEqual({
      step: 'chooseCourse',
      preselected: 'fr',
    });
  });

  // A placed course has nothing left to onboard, so the link behaves like a bare visit.
  it('falls back to the usual step when that course already has a level', () => {
    expect(resolveOnboardingStep([course('fr', 'B1'), course('de', null)], 'fr')).toEqual({
      step: 'chooseLevel',
      course: course('de', null),
    });
    expect(resolveOnboardingStep([course('fr', 'B1')], 'fr')).toEqual({
      step: 'chooseCourse',
      preselected: null,
    });
  });
});

describe('nextLevel', () => {
  it('aims one level above what the learner knows', () => {
    expect(nextLevel('A1')).toBe('A2');
    expect(nextLevel('B1')).toBe('B2');
  });

  /** Nothing sits above C2, so the course maintains it instead. */
  it('keeps C2 at C2', () => {
    expect(nextLevel('C2')).toBe('C2');
  });

  /** A learner who has mastered nothing is the only way to reach the A1 course. */
  it('starts a complete beginner at A1', () => {
    expect(nextLevel(null)).toBe('A1');
  });
});
