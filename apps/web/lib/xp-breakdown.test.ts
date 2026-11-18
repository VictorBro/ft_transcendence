import { CHALLENGE_XP, GOAL_XP } from '@ft/shared';
import { describe, expect, it } from 'vitest';

import { xpBreakdown } from './xp-breakdown';

describe('xpBreakdown', () => {
  it('splits a finish with the goal and the challenge, the rows adding up to xpGained', () => {
    const xpGained = 96 + GOAL_XP + CHALLENGE_XP;
    const { rows, legacyGoal } = xpBreakdown({
      xpGained,
      goalJustMet: true,
      challengeJustDone: true,
    });
    expect(rows).toEqual([
      { source: 'lesson', xp: 96 },
      { source: 'goal', xp: GOAL_XP },
      { source: 'challenge', xp: CHALLENGE_XP },
    ]);
    expect(rows.reduce((sum, row) => sum + row.xp, 0)).toBe(xpGained);
    expect(legacyGoal).toBe(false);
  });

  it('gives no rows for a finish from before #95, and says its goal was met', () => {
    expect(xpBreakdown({ xpGained: 0, goalJustMet: true, challengeJustDone: false })).toEqual({
      rows: [],
      legacyGoal: true,
    });
  });

  it('gives a plain lesson finish one row', () => {
    expect(xpBreakdown({ xpGained: 90, goalJustMet: false, challengeJustDone: false })).toEqual({
      rows: [{ source: 'lesson', xp: 90 }],
      legacyGoal: false,
    });
  });
});
