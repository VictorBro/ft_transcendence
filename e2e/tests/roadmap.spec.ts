import type { Page } from '@playwright/test';

import {
  type ConsoleViolation,
  formatViolations,
  isExpectedDocumentFailure,
  settle,
  watchConsole,
} from '../support/console-guard';
import {
  contentLessons,
  finishThroughApi,
  lessonPlan,
  playLesson,
  playToLastPage,
} from '../support/lesson-play';
import { liveConnection } from '../support/live';
import { expect, ONBOARDED_COURSE, placeCourse, test } from '../support/session';

/**
 * The roadmap and lesson loop on real lessons (#96): a lesson played
 * through its pages, the daily goal met, the streak, and the lesson found
 * again in the list. Every case is on French A1, the onboarded course,
 * except reading's, on French A2 (#148), and plays with lesson-play.ts:
 * through the pages, or through the API where the case says so. The
 * console guard watches each whole case.
 *
 * Each case that plays signs up its own learner: it moves the day's goal
 * and the streak, which the shared onboarded account must keep for the
 * specs that read them (today.spec.ts, course.spec.ts). The one case that
 * only reads uses that account.
 */

const { lang: LANG, level: LEVEL } = ONBOARDED_COURSE;
const course = `/en/learn/${LANG}`;
const lessonPath = (id: string, suffix = '') => `${course}/lessons/${id}${suffix}`;
const list = (params = '') => `${course}/lessons${params}`;

/** The playable kinds of French A1: grammar (#146), vocabulary (#147), functions (#149). */
const KINDS = ['grammar', 'vocabulary', 'functions'] as const;
/** Reading (#148) plays on French A2: A1 has no reading lesson ready. */
const READING_LEVEL = 'A2';

/**
 * The playable French A1 lessons, fewest pages first: a page is a request
 * and a round trip, so the cases that play a lesson twice, or several
 * against the rate limit, take the shortest.
 */
const BY_LENGTH = KINDS.flatMap((kind) => contentLessons(LANG, LEVEL, kind))
  .map((id) => {
    const { pages } = lessonPlan(id);
    return { id, pages: pages.length, units: pages.flatMap((p) => p.units).length };
  })
  .sort((a, b) => a.pages - b.pages || a.units - b.units || a.id.localeCompare(b.id))
  .map(({ id }) => id);
const SHORTEST = BY_LENGTH[0]!;

interface Card {
  id: string;
  title: string;
  ready: boolean;
  score: number | null;
}

interface Today {
  target: number;
  met: boolean;
  done: Card[];
  proposed: Card[];
  streak: { current: number; best: number; today: boolean };
}

interface LessonPage {
  total: number;
  page: number;
  pageSize: number;
  items: Card[];
}

const readToday = async (page: Page): Promise<Today> => {
  const response = await page.request.get(`/api/courses/${LANG}/today`);
  expect(response.status()).toBe(200);
  return response.json();
};

const readList = async (page: Page, params = ''): Promise<LessonPage> => {
  const response = await page.request.get(`/api/courses/${LANG}/lessons${params}`);
  expect(response.status()).toBe(200);
  return response.json();
};

const readCard = async (page: Page, id: string): Promise<Card> => {
  const response = await page.request.get(`/api/courses/${LANG}/lessons/${id}`);
  expect(response.status()).toBe(200);
  return response.json();
};

/**
 * Opens a signed in page and waits until it is quiet: its socket in its
 * room, its requests and prefetches done. Leaving a page while its socket
 * still connects logs a warning, and WebKit reports a cancelled prefetch as
 * a page error, so every visit in a guarded case goes through here.
 */
async function visit(page: Page, url: string): Promise<void> {
  const live = liveConnection(page);
  await page.goto(url);
  await live;
  await settle(page);
}

/** Starts a lesson from its page, as a learner does. */
async function start(page: Page, id: string): Promise<void> {
  await visit(page, lessonPath(id));
  await page.getByRole('button', { name: 'Start the lesson' }).click();
  await page.waitForURL(/\/play$/);
}

/** Plays the lesson open in the player to its results, `share` of the units right. */
async function playToResults(page: Page, id: string, share = 1): Promise<void> {
  await playLesson(page, lessonPlan(id), { share });
  await expect(page.getByRole('heading', { name: 'Your results' })).toBeVisible();
  // The results replace the player in the same tab: let their requests finish first.
  await settle(page);
}

const expectSilent = (violations: ConsoleViolation[]) =>
  expect(violations, formatViolations(violations)).toEqual([]);

/** The Today card of the course page. */
const todayCard = (page: Page) => page.getByRole('region', { name: 'Today' });

/** A row of the all lessons list. */
const row = (page: Page, id: string) => page.locator(`[data-lesson="${id}"]`);

/** The all lessons page of the unfiltered list that holds `id`, by the API. */
async function listPageOf(page: Page, id: string): Promise<number> {
  for (let n = 1; ; n += 1) {
    const { items, total, pageSize } = await readList(page, `?page=${n}`);
    if (items.some((card) => card.id === id)) return n;
    if (n * pageSize >= total) throw new Error(`${id} is on no page of the list`);
  }
}

test.describe('the roadmap and lesson loop', () => {
  // A play through the pages is some thirty requests.
  test.describe.configure({ timeout: 240_000 });

  test('goal 10: the proposed lesson meets the goal and starts the streak', async ({
    freshLearner: page,
  }) => {
    const violations = watchConsole(page);
    await placeCourse(page, { lang: LANG, level: LEVEL, dailyGoal: 10 });
    const [proposed] = (await readToday(page)).proposed;
    expect(proposed, 'a proposed lesson').toBeDefined();

    // From the course page: its Start opens the lesson page.
    await visit(page, course);
    await expect(page.getByText('Reach your daily goal to start a streak.')).toBeVisible();
    await todayCard(page).getByRole('link', { name: 'Start' }).click();
    await expect(page).toHaveURL(new RegExp(`${lessonPath(proposed!.id)}$`));
    await expect(page.getByRole('heading', { level: 1, name: proposed!.title })).toBeVisible();
    await expect(page.getByText('Not started', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to course' })).toHaveAttribute(
      'href',
      course,
    );
    await settle(page);

    await page.getByRole('button', { name: 'Start the lesson' }).click();
    await page.waitForURL(/\/play$/);
    await playToResults(page, proposed!.id);
    await expect(page.getByText('Daily goal reached')).toBeVisible();

    await visit(page, course);
    await expect(todayCard(page).getByText('Daily goal reached')).toBeVisible();
    await expect(page.getByText('1 day streak, today included.')).toBeVisible();
    expectSilent(violations);
  });

  test('goal 30: a lesson with no right answer still counts for the day', async ({
    freshLearner: page,
  }) => {
    const violations = watchConsole(page);
    await placeCourse(page, { lang: LANG, level: LEVEL, dailyGoal: 30 });
    const [proposed] = (await readToday(page)).proposed;
    expect(proposed, 'a proposed lesson').toBeDefined();

    await start(page, proposed!.id);
    await playToResults(page, proposed!.id, 0);

    await visit(page, course);
    const card = todayCard(page);
    await expect(card.getByText('30 min goal: 1 of 3 lessons')).toBeVisible();
    await expect(card.getByRole('listitem').filter({ hasText: proposed!.title })).toHaveText(
      /Not passed yet, best \d+%\. Counts for today\./,
    );
    await expect(page.getByText('Reach your daily goal to start a streak.')).toBeVisible();
    expectSilent(violations);
  });

  // The count only: a streak read at goal 60 could cross midnight.
  test('goal 60: the course page proposes six lessons', async ({ freshLearner: page }) => {
    const violations = watchConsole(page);
    await placeCourse(page, { lang: LANG, level: LEVEL, dailyGoal: 60 });

    await visit(page, course);

    const card = todayCard(page);
    await expect(card.getByText('60 min goal: 0 of 6 lessons')).toBeVisible();
    await expect(card.getByRole('link', { name: 'Start' })).toHaveCount(6);
    expectSilent(violations);
  });

  /**
   * Two contexts, one account: the course row's lock (goal.ts) makes the two
   * finishes take turns, so the day is met by exactly one of them. Goal 30 is
   * three lessons: one finished first, then the two whose last pages race.
   */
  test('two tabs finishing at the same time meet the goal once', async ({
    freshLearner: page,
    browser,
  }) => {
    const violations = watchConsole(page);
    await placeCourse(page, { lang: LANG, level: LEVEL, dailyGoal: 30 });
    // Any lesson counts for the day: the three shortest, so the API's 100
    // requests a minute per learner leave room for the reads after them.
    const [first, second, third] = BY_LENGTH;
    expect(third, 'three playable lessons').toBeDefined();
    await finishThroughApi(page.request, LANG, first!);

    const other = await browser.newContext({ storageState: await page.context().storageState() });
    try {
      const sendOne = await playToLastPage(page.request, LANG, second!);
      const sendOther = await playToLastPage(other.request, LANG, third!);
      const finished = await Promise.all([sendOne(), sendOther()]);

      const met = finished.map((attempt) => attempt.results!.finish.goalJustMet);
      expect(met.filter(Boolean), 'the goal met by one of the two').toHaveLength(1);
    } finally {
      await other.close();
    }

    const today = await readToday(page);
    expect(today.done).toHaveLength(3);
    expect(today.met).toBe(true);
    expect(today.streak.current).toBe(1);

    await visit(page, course);
    await expect(todayCard(page).getByText('Daily goal reached')).toBeVisible();
    await expect(page.getByText('1 day streak, today included.')).toBeVisible();
    expectSilent(violations);
  });

  test('a retake the same day raises the best score to the new score', async ({
    freshLearner: page,
  }) => {
    // Two plays: on top of the timeout, which already holds the signup's wait.
    test.setTimeout(test.info().timeout + 120_000);
    const violations = watchConsole(page);
    await placeCourse(page, { lang: LANG, level: LEVEL, dailyGoal: 10 });

    await start(page, SHORTEST);
    await playToResults(page, SHORTEST, 0.5);
    const { score: half } = await readCard(page, SHORTEST);
    expect(half, 'a score below 100 with half the answers right').toBeLessThan(100);
    await visit(page, lessonPath(SHORTEST));
    await expect(page.getByText(`Best score: ${half}%`)).toBeVisible();

    // Retake from the results: it asks first, then starts again at the first page.
    await visit(page, lessonPath(SHORTEST, '/results'));
    await page.getByRole('button', { name: 'Retake the lesson' }).click();
    await page.getByRole('button', { name: 'Retake', exact: true }).click();
    await page.waitForURL(/\/play$/);
    await expect(page.locator('[data-page-index="0"]')).toBeVisible();
    await playToResults(page, SHORTEST);
    await expect(page.getByText('Score: 100 / 100')).toBeVisible();

    expect((await readCard(page, SHORTEST)).score).toBe(100);
    await visit(page, lessonPath(SHORTEST));
    await expect(page.getByText('Best score: 100%')).toBeVisible();
    expectSilent(violations);
  });

  test('the all lessons page: the Passed filter, page 2 by URL, and no JavaScript', async ({
    freshLearner: page,
    browser,
  }) => {
    const violations = watchConsole(page);
    await placeCourse(page, { lang: LANG, level: LEVEL, dailyGoal: 10 });
    await start(page, SHORTEST);
    await playToResults(page, SHORTEST);

    // Passed: the one lesson passed, and only it.
    await visit(page, list());
    await page.getByRole('checkbox', { name: 'Passed', exact: true }).check();
    await expect(page).toHaveURL(/\/lessons\?status=done$/);
    await expect(page.locator('[data-lesson]')).toHaveCount(1);
    await expect(row(page, SHORTEST)).toContainText('Passed');
    await settle(page);

    // Page 2 of the unfiltered list, straight from its URL.
    const second = await readList(page, '?page=2');
    expect(second.items.length, 'a second page').toBeGreaterThan(0);
    await visit(page, list('?page=2'));
    const pager = page.getByRole('navigation', { name: 'Pages' });
    await expect(pager.locator('[aria-current="page"]')).toHaveText('2');
    await expect(page.locator('[data-lesson]')).toHaveCount(second.items.length);
    await expect(page.locator('[data-lesson]').first()).toHaveAttribute(
      'data-lesson',
      second.items[0]!.id,
    );
    expectSilent(violations);

    // Without JavaScript, the list still renders, the passed lesson in it.
    const first = await readList(page);
    const context = await browser.newContext({
      storageState: await page.context().storageState(),
      javaScriptEnabled: false,
    });
    try {
      const noScript = await context.newPage();
      await noScript.goto(list());
      await expect(noScript.locator('[data-lesson]')).toHaveCount(first.items.length);
      await expect(row(noScript, SHORTEST)).toContainText('Passed');
    } finally {
      await context.close();
    }
  });

  test('a lesson not ready is Coming soon in the list, and its URL is the 404 page', async ({
    onboarded: page,
  }) => {
    // The first lesson of the level without its files: #13 of French A1 today.
    const soon = (await readList(page)).items.find((card) => !card.ready);
    expect(soon, 'a Coming soon lesson on page 1').toBeDefined();
    const violations = watchConsole(page);

    await visit(page, list());
    await expect(row(page, soon!.id)).toContainText('Coming soon');
    await expect(row(page, soon!.id).getByRole('link')).toHaveCount(0);

    const response = await page.goto(lessonPath(soon!.id));
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await settle(page);
    // The document's own 404 is the status above working, not the page breaking.
    expectSilent(
      violations.filter((violation) => !isExpectedDocumentFailure(violation, page.url(), 404)),
    );
  });

  for (const kind of KINDS) {
    test(`a ${kind} lesson plays to its results, then its row is Passed`, async ({
      freshLearner: page,
    }) => {
      const [id] = contentLessons(LANG, LEVEL, kind);
      expect(id, `a French ${LEVEL} ${kind} lesson`).toBeDefined();
      const violations = watchConsole(page);
      await placeCourse(page, { lang: LANG, level: LEVEL, dailyGoal: 10 });

      await start(page, id!);
      await playToResults(page, id!);
      await expect(page.getByText('Score: 100 / 100')).toBeVisible();

      await visit(page, list(`?page=${await listPageOf(page, id!)}`));
      await expect(row(page, id!)).toContainText('Passed');
      await expect(row(page, id!)).not.toContainText('Not passed yet');
      expectSilent(violations);
    });
  }

  // Reading (#148) on French A2: French A1 has no reading lesson ready.
  test('a reading lesson plays to its results, its skim timing out, then its row is Passed', async ({
    freshLearner: page,
  }) => {
    const [id] = contentLessons(LANG, READING_LEVEL, 'reading');
    expect(id, `a French ${READING_LEVEL} reading lesson`).toBeDefined();
    const plan = lessonPlan(id!);
    const violations = watchConsole(page);
    // The skim countdown is the browser's: the clock jumps to its end instead of waiting it out.
    await page.clock.install();
    await placeCourse(page, { lang: LANG, level: READING_LEVEL, dailyGoal: 10 });

    // The lesson page: the key word count, and not the situation, which
    // answers the skim question ("… to tell her readers about her three days
    // in Marseille" before "Why does Camille write this post?").
    await visit(page, lessonPath(id!));
    const brief = plan.brief as { situation: { en: string }; keywords: unknown[] };
    await expect(
      page.getByText(`${brief.keywords.length} key words`, { exact: true }),
    ).toBeVisible();
    await expect(page.locator('main')).not.toContainText(brief.situation.en);
    await page.getByRole('button', { name: 'Start the lesson' }).click();
    await page.waitForURL(/\/play$/);

    await playLesson(page, plan, { skim: 'timeout' });
    await expect(page.getByRole('heading', { name: 'Your results' })).toBeVisible();
    await settle(page);
    await expect(page.getByText('Score: 100 / 100')).toBeVisible();

    await visit(page, list(`?page=${await listPageOf(page, id!)}`));
    await expect(row(page, id!)).toContainText('Passed');
    expectSilent(violations);
  });
});
