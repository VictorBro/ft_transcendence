import { CHALLENGE_XP, GOAL_XP, type FinishResult } from '@ft/shared';

export type XpSource = 'lesson' | 'goal' | 'challenge';

/**
 * What a finish's XP was made of, for the XP card of the results (#97):
 * the lesson's share, then the goal's and the challenge's when they count.
 *
 * A finish closed before #95 kept goalJustMet but earned nothing (the API's
 * viewOf fills it with EARNED_NOTHING, xpGained 0): no rows then, so no
 * amount that was never awarded, and `legacyGoal` says the goal was met.
 */
export function xpBreakdown(
  finish: Pick<FinishResult, 'xpGained' | 'goalJustMet' | 'challengeJustDone'>,
): { rows: { source: XpSource; xp: number }[]; legacyGoal: boolean } {
  const goal = finish.goalJustMet ? GOAL_XP : 0;
  const challenge = finish.challengeJustDone ? CHALLENGE_XP : 0;
  if (finish.xpGained < goal + challenge) {
    return { rows: [], legacyGoal: finish.goalJustMet };
  }
  return {
    rows: [
      { source: 'lesson', xp: finish.xpGained - goal - challenge },
      ...(goal > 0 ? [{ source: 'goal' as const, xp: goal }] : []),
      ...(challenge > 0 ? [{ source: 'challenge' as const, xp: challenge }] : []),
    ],
    legacyGoal: false,
  };
}
