import {
  ACHIEVEMENTS,
  AchievementListSchema,
  LESSON_PASS_MARK,
  LEVEL_PASS_SHARE,
  RANK_STEP,
  type AchievementCode,
  type AchievementList,
  type Language,
  TodaySchema,
  type Xp,
} from '@ft/shared';

import { apiGet } from './api';

/**
 * The gamification pages (#97). Every number a rule states comes from the
 * shared constants through these params, so the text always matches the
 * rules the API applies.
 */

/** The messages' params for one achievement: its target, or its level. */
export function achievementParams(code: AchievementCode): Record<string, string | number> {
  const definition = ACHIEVEMENTS.find((achievement) => achievement.code === code)!;
  return 'level' in definition
    ? { level: definition.level, share: Math.round(LEVEL_PASS_SHARE * 100) }
    : { target: definition.target, mark: LESSON_PASS_MARK };
}

/** The XP a rank opens at: 0, 100, 300, 600… (rankOf in the API inverts it). */
export function rankStartOf(rank: number): number {
  return (RANK_STEP * rank * (rank - 1)) / 2;
}

/**
 * GET /api/courses/:lang/achievements, once per achievements page. The page
 * checks the course first, so the 404 and 409 of the route never reach here:
 * like loadToday, an unavailable API throws, and a 401 goes back to /login.
 */
export async function loadAchievements(lang: Language): Promise<AchievementList | 'signed-out'> {
  const result = await apiGet(AchievementListSchema, `/api/courses/${lang}/achievements`);

  if (result.status === 'unavailable') {
    throw new Error(`Could not load the achievements: ${result.reason}`);
  }
  return result.status === 'signed-out' ? 'signed-out' : result.data;
}

/**
 * The course's XP after a finish, for the rank bar of the results. Never
 * throws: a course without a level answers 409 and can still have played a
 * lesson, and the results page stands without its rank.
 */
export async function loadXp(lang: Language): Promise<Xp | null> {
  const result = await apiGet(TodaySchema, `/api/courses/${lang}/today`);
  return result.status === 'ok' ? result.data.xp : null;
}

/** Where the achievements and their rules are. */
export function achievementsPath(lang: Language): string {
  return `/learn/${lang}/achievements`;
}
