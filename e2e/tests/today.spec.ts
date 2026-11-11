import type { Page } from '@playwright/test';

import { finishThroughApi } from '../support/lesson-play';
import {
  expect,
  finishBlank,
  ONBOARDED_COURSE,
  pickLevel,
  placeCourse,
  test,
} from '../support/session';

/**
 * The course home as the daily goal page (#86). The numbers come from the API
 * rather than from the seed, so new content does not break the assertions.
 */

interface Card {
  id: string;
  title: string;
  level: string;
}

interface Today {
  target: number;
  met: boolean;
  done: Card[];
  proposed: Card[];
  extra: Card[];
  streak: { current: number; best: number; today: boolean };
  progress: {
    total: number;
    attempted: number;
    passed: number;
    needed: number;
    comingSoon: number;
    complete: boolean;
  };
  levelAfter: string | null;
}

const readToday = async (page: Page, lang: string): Promise<Today> => {
  const response = await page.request.get(`/api/courses/${lang}/today`);
  expect(response.status()).toBe(200);
  return response.json();
};

const home = (lang: string) => `/en/learn/${lang}`;

test.describe('the daily goal page', () => {
  test('a fresh day proposes the target, with one Next up', async ({ onboarded }) => {
    await placeCourse(onboarded, ONBOARDED_COURSE);
    // The shared account: read what it has done today rather than assume none.
    const today = await readToday(onboarded, ONBOARDED_COURSE.lang);
    expect(today.met).toBe(false);
    const done = today.done.length;

    await onboarded.goto(home(ONBOARDED_COURSE.lang));
    const card = onboarded.getByRole('region', { name: 'Today' });

    if (today.streak.current === 0) {
      await expect(onboarded.getByText('Reach your daily goal to start a streak.')).toBeVisible();
    }
    await expect(
      card.getByText(`${ONBOARDED_COURSE.dailyGoal} min goal: ${done} of ${today.target} lessons`),
    ).toBeVisible();
    await expect(card.getByRole('progressbar', { name: 'Daily goal' })).toHaveAttribute(
      'aria-valuenow',
      String(done),
    );
    await expect(card.getByText('Next up', { exact: true })).toBeVisible();

    const start = card.getByRole('link', { name: 'Start' });
    await expect(start).toHaveCount(today.proposed.length);
    await expect(start.first()).toHaveAttribute(
      'href',
      `/en/learn/${ONBOARDED_COURSE.lang}/lessons/${today.proposed[0]!.id}`,
    );

    const more = onboarded.getByRole('region', { name: 'More lessons' });
    await expect(more.getByRole('link', { name: 'Open' })).toHaveCount(today.extra.length);

    const { total, comingSoon } = today.progress;
    await expect(
      onboarded.getByRole('link', {
        name: `See all ${total + comingSoon} ${ONBOARDED_COURSE.level} lessons`,
      }),
    ).toHaveAttribute('href', `/en/learn/${ONBOARDED_COURSE.lang}/lessons`);
    const { attempted, passed, needed } = today.progress;
    await expect(onboarded.getByText(`Attempted ${attempted} of ${total}`)).toBeVisible();
    await expect(
      onboarded.getByText(`Passed ${passed} of ${total}, ${needed} needed`),
    ).toBeVisible();
    if (comingSoon > 0) {
      await expect(onboarded.getByText(`${comingSoon} coming soon`)).toBeVisible();
    }
  });

  // View source: the proposal is in the server's HTML, so it needs no JavaScript.
  test('the page renders the proposal without JavaScript', async ({ onboarded }) => {
    await placeCourse(onboarded, ONBOARDED_COURSE);
    const today = await readToday(onboarded, ONBOARDED_COURSE.lang);
    const shown = today.met ? today.done : today.proposed;

    const html = await (await onboarded.request.get(home(ONBOARDED_COURSE.lang))).text();

    // Each lesson by its link, which holds the id: a title would need React's
    // escaping of &, <, >, " and ' copied here.
    expect(html).toContain('role="progressbar"');
    for (const lesson of shown) {
      expect(html).toContain(`/en/learn/${ONBOARDED_COURSE.lang}/lessons/${lesson.id}`);
    }
  });

  /**
   * One learner through a whole day, since every account costs a signup: a
   * lesson not passed, then the goal met, raised, and the level changed and
   * back. Goal 10 is one lesson a day. The level complete card has its own
   * test below.
   */
  test('a day of lessons: goal met, raised, and the level changed', async ({
    freshLearner: page,
  }) => {
    const lang = ONBOARDED_COURSE.lang;
    await placeCourse(page, { lang, level: 'A1', dailyGoal: 10 });
    const first = await readToday(page, lang);
    const [lesson] = first.proposed;
    expect(lesson).toBeDefined();

    // Not passed, but it counts for today: the goal of one lesson is met.
    await finishBlank(page, lang, lesson!.id);
    await page.goto(home(lang));
    const card = page.getByRole('region', { name: 'Today' });
    await expect(card.getByText('Daily goal reached')).toBeVisible();
    await expect(card.getByText('Not passed yet, best 0%. Counts for today.')).toBeVisible();
    await expect(card.getByRole('link', { name: 'Start' })).toHaveCount(0);
    await expect(page.getByText('1 day streak, today included.')).toBeVisible();

    // Raised after it was met: one done of three, two proposed, and today still counts.
    await page.getByRole('combobox', { name: 'Daily goal' }).selectOption('30');
    await expect(card.getByText('30 min goal: 1 of 3 lessons')).toBeVisible();
    await expect(card.getByRole('link', { name: 'Start' })).toHaveCount(2);
    await expect(page.getByText('1 day streak, today included.')).toBeVisible();

    // A2 proposes A2 lessons, and the A1 lesson done today stays in done, badged.
    const level = page.getByRole('combobox', { name: 'Level' });
    const save = page.getByRole('button', { name: 'Save' });
    await pickLevel(page, 'A2');
    await save.click();
    await expect(save).toHaveCount(0);
    const a2 = await readToday(page, lang);
    if (a2.proposed.length > 0) {
      await expect(card.getByRole('link', { name: 'Start' }).first()).toHaveAttribute(
        'href',
        `/en/learn/${lang}/lessons/${a2.proposed[0]!.id}`,
      );
    }
    await expect(card.getByText('A1', { exact: true })).toBeVisible();

    // Back at A1, its progress was kept.
    await pickLevel(page, 'A1');
    await save.click();
    await expect(save).toHaveCount(0);
    await expect(level).toHaveValue('A1');
    await expect(page.getByText(/^Attempted 1 of \d+$/)).toBeVisible();
  });

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

    await page.goto(home(lang));
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
});
