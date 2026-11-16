import type { Page } from '@playwright/test';

import { finishThroughApi } from '../support/lesson-play';
import { expect, ONBOARDED_COURSE, placeCourse, test } from '../support/session';

/**
 * The level complete card of the course home (#86), apart from today.spec.ts:
 * this one test takes about two minutes, nearly all of it waiting out the
 * API's rate limit. Its own file sorts mid-suite, so the tests after it run
 * beside it instead of the run ending on it alone.
 */

interface Card {
  id: string;
}

interface Today {
  proposed: Card[];
  extra: Card[];
  progress: { total: number; passed: number; needed: number; complete: boolean };
}

const readToday = async (page: Page, lang: string): Promise<Today> => {
  const response = await page.request.get(`/api/courses/${lang}/today`);
  expect(response.status()).toBe(200);
  return response.json();
};

/**
 * Every ready lesson of the level passed, through the attempt routes with
 * the right answers from the lesson files (lesson-play.ts): the level is
 * complete, and Start A2 moves the course on.
 */
test('the level complete card starts the next level', async ({
  freshLearner: page,
  browserName,
}) => {
  // Some three hundred pages through the API, which allows a learner 100
  // requests a minute: minutes of waiting, and no engine in the path.
  test.skip(
    browserName !== 'chromium',
    'API play: the engine adds nothing, the rate limit minutes',
  );
  test.setTimeout(6 * 60_000);
  const lang = ONBOARDED_COURSE.lang;
  await placeCourse(page, { lang, level: 'A1', dailyGoal: 10 });

  // Today offers only ready lessons, never one done today, a few at a time:
  // finishing what it offers until it offers nothing passes the level.
  for (let round = 0; round < 20; round += 1) {
    const { proposed, extra } = await readToday(page, lang);
    if (proposed.length === 0 && extra.length === 0) {
      break;
    }
    for (const card of [...proposed, ...extra]) {
      const attempt = await finishThroughApi(page.request, lang, card.id);
      expect(attempt.results?.score, card.id).toBe(100);
    }
  }
  const done = await readToday(page, lang);
  expect(done.progress.complete).toBe(true);

  await page.goto(`/en/learn/${lang}`);
  const { total, passed, needed } = done.progress;
  await expect(
    page.getByText(
      `You finished A1: ${total} of ${total} attempted, ${passed} passed, ${needed} needed.`,
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Start A2' }).click();

  await expect(page.getByRole('combobox', { name: 'Level' })).toHaveValue('A2');
  await expect(page.getByRole('button', { name: 'Start A2' })).toHaveCount(0);
});
