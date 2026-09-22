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
    expect(resolveOnboardingStep([])).toEqual({ step: 'chooseCourse' });
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
    });
  });

  it('resumes the newest unfinished course, not the oldest', () => {
    expect(
      resolveOnboardingStep([course('de', null), course('fr', 'B1'), course('en', null)]),
    ).toEqual({ step: 'chooseLevel', course: course('en', null) });
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
