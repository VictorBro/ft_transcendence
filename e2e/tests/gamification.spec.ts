import type { Page } from '@playwright/test';

import { expectPinned } from '../support/layout';
import { finishThroughApi } from '../support/lesson-play';
import { expect, ONBOARDED_COURSE, placeCourse, test } from '../support/session';

/**
 * The rank, the challenge and the achievements (#97), on a fresh learner
 * placed in French A1 at goal 30. The lessons are played through their
 * attempt routes with the answers from the lesson files (lesson-play.ts),
 * then the pages are read in the browser. Each step reads today's challenge
 * from GET today and plays lessons that miss it, except the one about the
 * challenge. Every number comes from the API, so content changes do not
 * break the assertions.
 */

const LANG = 'fr';
const LESSON_XP = 10;
const CHALLENGE_XP = 30;
const KINDS = ['grammar', 'vocabulary', 'functions', 'reading'];

interface Today {
  xp: { total: number; rank: number; rankStart: number; nextRankAt: number };
  challenge: { code: string; done: boolean };
  earnedToday: string[];
}

interface AchievementItem {
  code: string;
  day: string | null;
  current: number;
  target: number;
}

const readToday = async (page: Page): Promise<Today> => {
  const response = await page.request.get(`/api/courses/${LANG}/today`);
  expect(response.status()).toBe(200);
  return response.json();
};

/** The level's lessons not started yet, of the given kinds: one of them is played next. */
const untouched = async (page: Page, kinds: string[]): Promise<string[]> => {
  const query = `status=todo&kind=${kinds.join(',')}`;
  const response = await page.request.get(`/api/courses/${LANG}/lessons?${query}`);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { items: { id: string }[] };
  return body.items.map((item) => item.id);
};

/**
 * A lesson and a share of right answers that miss the challenge: another
 * kind for a kind challenge, and under 90 for score90. beyondGoal is missed
 * by any of the first three lessons at goal 30.
 */
const missing = async (page: Page, challenge: string) => {
  const kinds = KINDS.filter((kind) => kind !== challenge);
  const [id] = await untouched(page, kinds);
  expect(id, `a lesson that is not ${challenge}`).toBeDefined();
  return { id: id!, share: challenge === 'score90' ? 0.75 : 0.8 };
};

/** The XP of one row of the results' XP card: the cell after its label. */
const xpRow = (page: Page, label: string) =>
  page
    .locator('[data-slot="xp"] dt')
    .filter({ hasText: label })
    .locator('xpath=following-sibling::dd[1]');

const home = `/en/learn/${LANG}`;
const achievements = `/en/learn/${LANG}/achievements`;
const results = (id: string) => `/en/learn/${LANG}/lessons/${id}/results`;

test.describe('rank, challenge and achievements', () => {
  // A few whole lessons through the API, each some thirty pages.
  test.describe.configure({ timeout: 240_000 });

  test('a first finish, then the challenge, then rank 2', async ({ freshLearner: page }) => {
    await placeCourse(page, { lang: LANG, level: 'A1', dailyGoal: 30 });
    const fresh = await readToday(page);
    expect(fresh.xp.total).toBe(0);
    const { code } = fresh.challenge;

    // A first finish that misses the challenge: the lesson's XP and First lesson.
    const first = await missing(page, code);
    const played = await finishThroughApi(page.request, LANG, first.id, { share: first.share });
    const finish = played.results!.finish;
    expect(finish.challengeJustDone).toBe(false);
    // The stored score, whole: XP is counted on it, not on the raw 86.5.
    const score = finish.best;
    expect(finish.xpGained).toBe(LESSON_XP + score);

    await page.goto(results(first.id));
    const xp = page.getByRole('region', { name: `+${finish.xpGained} XP` });
    await expect(xp).toBeVisible();
    await expect(xpRow(page, 'Lesson')).toHaveText(`+${LESSON_XP + score} XP`);
    await expect(xp.getByRole('heading', { name: 'New achievement' })).toBeVisible();
    await expect(xp.getByRole('listitem').filter({ hasText: 'First lesson' })).toBeVisible();
    // The rank the course is at now, with the link to the rules.
    await expect(xp.getByText(`Rank 1 · ${finish.xpGained} of 100 XP`)).toBeVisible();
    await expect(xp.getByRole('link', { name: 'Achievements and rules' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to course' })).toBeVisible();

    // The course page: the XP, the bar from the rank's start, and New today.
    await page.goto(home);
    await expect(page.getByText(`Rank 1 · ${finish.xpGained} of 100 XP`)).toBeVisible();
    await expect(
      page.getByRole('progressbar', { name: 'Progress to the next rank' }),
    ).toHaveAttribute('aria-valuenow', String(finish.xpGained));
    const newToday = page.getByRole('region', { name: 'New today' });
    await expect(newToday.getByRole('link', { name: 'First lesson' })).toBeVisible();

    // The achievements page: First lesson earned today, the others locked with progress.
    const list = await page.request.get(`/api/courses/${LANG}/achievements`);
    const items = ((await list.json()) as { items: AchievementItem[] }).items;
    const firstLesson = items.find((item) => item.code === 'firstLesson')!;
    expect(firstLesson.day).not.toBeNull();
    const date = new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(
      new Date(`${firstLesson.day}T00:00:00.000Z`),
    );

    await page.goto(achievements);
    await expect(page.getByRole('heading', { name: 'Achievements', level: 1 })).toBeVisible();
    await expect(page.locator('[data-achievement]')).toHaveCount(16);
    // Four families, in catalogue order: First lesson opens Lessons, 1 of 4 earned.
    const groups = page.locator('[data-group]');
    await expect(groups).toHaveCount(4);
    const lessons = page.getByRole('region', { name: 'Lessons' });
    await expect(lessons.locator('[data-achievement]').first()).toHaveAttribute(
      'data-achievement',
      'firstLesson',
    );
    await expect(lessons.getByText('1 of 4', { exact: true })).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Achievements earned' })).toHaveAttribute(
      'aria-valuenow',
      '1',
    );
    const earned = page.locator('[data-achievement="firstLesson"]');
    await expect(earned).toHaveAttribute('data-earned', 'true');
    await expect(earned.getByText(`Earned on ${date}`)).toBeVisible();
    const streak7 = items.find((item) => item.code === 'streak7')!;
    const locked = page.locator('[data-achievement="streak7"]');
    await expect(locked).toHaveAttribute('data-earned', 'false');
    await expect(
      locked.getByText(`${streak7.current} of ${streak7.target} days`, { exact: true }),
    ).toBeVisible();
    await expect(locked.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      String(streak7.current),
    );
    await expect(
      page.locator('[data-achievement="levelA1"]').getByText(/^Attempted \d+ of \d+ · Passed/),
    ).toBeVisible();

    // Off the page first: its RefreshOn reloads on the finishes below, and on
    // WebKit that reload interrupts the next goto.
    await page.goto('about:blank');

    // The challenge: misses first for beyondGoal (goal 30 is three lessons), then the one that does it.
    if (code === 'beyondGoal') {
      for (let n = 0; n < 2; n += 1) {
        const miss = await missing(page, code);
        await finishThroughApi(page.request, LANG, miss.id, { share: miss.share });
      }
    }
    const [meet] = await untouched(page, KINDS.includes(code) ? [code] : KINDS);
    expect(meet, `a lesson that does ${code}`).toBeDefined();
    const before = (await readToday(page)).xp.total;
    const done = await finishThroughApi(page.request, LANG, meet!);
    expect(done.results!.finish.challengeJustDone).toBe(true);

    await page.goto(results(meet!));
    await expect(xpRow(page, 'Challenge done')).toHaveText(`+${CHALLENGE_XP} XP`);

    const after = await readToday(page);
    expect(after.challenge).toEqual({ code, done: true });
    expect(after.xp.total).toBe(before + done.results!.finish.xpGained);
    expect(done.results!.finish.xpGained).toBeGreaterThanOrEqual(CHALLENGE_XP);

    await page.goto(home);
    const challenge = page.getByRole('region', { name: "Today's challenge" });
    await expect(challenge.getByText('Done', { exact: true })).toBeVisible();
    await expect(challenge.getByText(`+${CHALLENGE_XP} XP`)).toBeVisible();

    // Rank 2 once the total reaches 100: the bar starts again from 100.
    expect(after.xp.total).toBeGreaterThanOrEqual(100);
    await expect(
      page.getByText(`Rank ${after.xp.rank} · ${after.xp.total} of ${after.xp.nextRankAt} XP`),
    ).toBeVisible();
    expect(after.xp.rank).toBeGreaterThanOrEqual(2);
    await expect(
      page.getByRole('progressbar', { name: 'Progress to the next rank' }),
    ).toHaveAttribute('aria-valuenow', String(after.xp.total - after.xp.rankStart));
  });

  test('one click on the course page opens the achievements and their rules', async ({
    onboarded,
  }) => {
    await placeCourse(onboarded, ONBOARDED_COURSE);
    await onboarded.goto(`/en/learn/${ONBOARDED_COURSE.lang}`);

    await onboarded.getByRole('link', { name: 'Achievements and rules' }).click();

    await expect(onboarded).toHaveURL(`/en/learn/${ONBOARDED_COURSE.lang}/achievements`);
    await expect(onboarded.getByRole('heading', { name: 'How it works' })).toBeVisible();
    // Each rule with its amount on the right, the numbers from the shared constants.
    const rules = onboarded.getByRole('region', { name: 'How it works' });
    const amountOf = (rule: string) =>
      rules.locator('dt').filter({ hasText: rule }).locator('xpath=following-sibling::dd[1]');
    await expect(amountOf('Reaching your daily goal')).toHaveText('+20 XP');
    await expect(amountOf("Doing the day's challenge")).toHaveText('+30 XP');
    await expect(amountOf('Rank 2')).toHaveText('from 100 XP');

    // On a short desktop window the rules scroll in their column, never the page.
    await onboarded.setViewportSize({ width: 1280, height: 720 });
    await expectPinned(onboarded, 'achievements');
  });

  // View source: both pages are server components, so the HTML holds everything.
  test('both pages render without JavaScript', async ({ onboarded }) => {
    await placeCourse(onboarded, ONBOARDED_COURSE);
    const today = await readToday(onboarded);

    const course = await (await onboarded.request.get(`/en/learn/${ONBOARDED_COURSE.lang}`)).text();
    expect(course).toContain(
      `Rank ${today.xp.rank} · ${today.xp.total} of ${today.xp.nextRankAt} XP`,
    );
    expect(course).toContain('Achievements and rules');
    expect(course).toContain('Today&#x27;s challenge');

    const page = await (
      await onboarded.request.get(`/en/learn/${ONBOARDED_COURSE.lang}/achievements`)
    ).text();
    expect(page.match(/data-achievement="/g)).toHaveLength(16);
    expect(page).toContain('How it works');
  });
});
