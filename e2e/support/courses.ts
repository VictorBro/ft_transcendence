import { expect, type Page } from '@playwright/test';

/**
 * Gives the account a course, for the specs whose subject only renders once one
 * exists. Onboarding (#49) is the only UI that can create one, so this goes
 * through the API.
 *
 * The account is worker-scoped and courses are never deleted, so a second call
 * for the same language gets a 409. Both are a usable start; anything else
 * means setup broke and every assertion after it would be meaningless. The goal
 * is then pinned, because a course left over from an earlier test would
 * otherwise decide it.
 */
export async function ensureCourse(page: Page, lang: string, dailyGoal: number): Promise<void> {
  const created = await page.request.post('/api/courses', { data: { lang, dailyGoal } });
  expect([201, 409]).toContain(created.status());

  const pinned = await page.request.patch(`/api/courses/${lang}`, { data: { dailyGoal } });
  expect(pinned.status()).toBe(200);
}
