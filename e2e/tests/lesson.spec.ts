import type { Page } from '@playwright/test';

import { formatViolations, settle, watchConsole } from '../support/console-guard';
import { expectFitsTheScreen } from '../support/layout';
import {
  answerPage,
  contentLessons,
  lessonPlan,
  mainButton,
  pageIndex,
  playLesson,
  sendPage,
  unrollDialogue,
} from '../support/lesson-play';
import { liveConnection } from '../support/live';
import { expect, placeCourse, test } from '../support/session';

/**
 * The lesson page, the player and the results (#146), on a French A1
 * grammar lesson played the way a learner plays it: the answers come from
 * the lesson file (lesson-play.ts), typed and picked through the page.
 * The console guard watches each whole play, and the phone width holds on
 * the lesson, exercise, exam and results pages.
 */

const LANG = 'fr';
const LESSON = 'fr-subject-pronouns';
const page = (suffix = '', lesson = LESSON) => `/en/learn/${LANG}/lessons/${lesson}${suffix}`;

/** The other French A1 grammar lessons in content/: each plays to its results in the browser too. */
const OTHER_GRAMMAR = contentLessons(LANG, 'A1', 'grammar').filter((id) => id !== LESSON);
/** The French A1 vocabulary lessons (#147), built from their briefs. */
const VOCABULARY = contentLessons(LANG, 'A1', 'vocabulary');
/** The French A1 functions lessons (#149). */
const FUNCTIONS = contentLessons(LANG, 'A1', 'functions');

/** Opens a lesson page and starts the lesson. */
async function start(p: Page, lesson = LESSON): Promise<void> {
  await p.goto(page('', lesson));
  await p.getByRole('button', { name: 'Start the lesson' }).click();
  await p.waitForURL(/\/play$/);
}
const plan = lessonPlan(LESSON, 'en');
const firstOf = (role: string) => plan.pages.findIndex((p) => p.role === role);
const FIRST_PRACTICE = firstOf('practice');
const FIRST_EXAM = firstOf('exam');

/** A typed gap of the plan's first practice pages: where a draft is kept. */
const FIRST_TYPED = plan.pages.findIndex(
  (p) => p.role === 'practice' && p.units.some((u) => u.kind === 'text'),
);

/** The countdown of an exam page, in seconds. */
const timeLeft = async (p: Page): Promise<number> => {
  const [m, s] = (await p.getByTestId('time-left').innerText()).split(':').map(Number);
  return m! * 60 + s!;
};

const PHONE = { width: 360, height: 800 };

test.describe('a grammar lesson', () => {
  // One play is some thirty pages, and each is a request.
  test.describe.configure({ timeout: 240_000 });

  test('plays from the lesson page to the results, which stay', async ({
    freshLearner,
    browser,
  }) => {
    const learner = freshLearner;
    await learner.setViewportSize(PHONE);
    const violations = watchConsole(learner);
    await placeCourse(learner, { lang: LANG, level: 'A1', dailyGoal: 10 });

    await learner.goto(page());
    await expect(learner.getByRole('heading', { level: 1, name: plan.title })).toBeVisible();
    await expect(learner.getByText('Not started', { exact: true })).toBeVisible();
    await expectFitsTheScreen(learner, 'lesson page');

    await learner.getByRole('button', { name: 'Start the lesson' }).click();
    await learner.waitForURL(/\/play$/);
    await expect(learner.locator('[data-page-index="0"]')).toBeVisible();

    await playLesson(learner, plan, { stop: (index) => index === FIRST_PRACTICE });
    await expectFitsTheScreen(learner, 'exercise page');
    await playLesson(learner, plan, { share: 0.75, stop: (index) => index === FIRST_EXAM });
    await expect(learner.getByRole('timer', { name: 'Time left' })).toBeVisible();
    await expectFitsTheScreen(learner, 'exam page');
    await playLesson(learner, plan, { share: 0.75 });

    await expect(learner.getByRole('heading', { name: 'Your results' })).toBeVisible();
    await expect(learner.getByText(/^Score: \d+(\.\d)? \/ 100$/)).toBeVisible();
    await expect(learner.getByText('Daily goal reached')).toBeVisible();
    await expectFitsTheScreen(learner, 'results page');

    // The last page replaced the player: Back is the lesson page, finished.
    await learner.goBack();
    await expect(learner).toHaveURL(new RegExp(`${page()}$`));
    await expect(learner.getByRole('link', { name: 'See your results' })).toBeVisible();
    await expect(learner.getByRole('button', { name: 'Retake the lesson' })).toBeVisible();

    // The results reload, and the course page shows the lesson done today.
    // Each load waits for its socket and its link prefetches before the
    // next one: leaving a page while its socket still connects logs a
    // warning, and WebKit reports a cancelled prefetch as a page error.
    await settle(learner);
    let live = liveConnection(learner);
    await learner.goto(page('/results'));
    await live;
    await settle(learner);
    live = liveConnection(learner);
    await learner.reload();
    await expect(learner.getByRole('heading', { name: 'Your results' })).toBeVisible();
    await live;
    await settle(learner);
    await learner.goto(`/en/learn/${LANG}`);
    // Done today, with its score: a row of its own, with no Start or Open.
    const done = learner
      .getByRole('region', { name: 'Today' })
      .getByRole('listitem')
      .filter({ hasText: plan.title });
    await expect(done).toHaveText(/Passed, \d+%|Not passed yet, best \d+%\. Counts for today\./);
    await expect(done.getByRole('link')).toHaveCount(0);

    expect(violations, formatViolations(violations)).toEqual([]);

    // Without JavaScript, the lesson page and the results still render.
    const context = await browser.newContext({
      storageState: await learner.context().storageState(),
      javaScriptEnabled: false,
    });
    const noScript = await context.newPage();
    await noScript.goto(page());
    await expect(noScript.getByRole('heading', { level: 1, name: plan.title })).toBeVisible();
    await expect(noScript.getByRole('link', { name: 'See your results' })).toBeVisible();
    await noScript.goto(page('/results'));
    await expect(noScript.getByRole('heading', { name: 'Your results' })).toBeVisible();
    await expect(noScript.locator('[data-outcome]')).toHaveCount(
      plan.pages.filter((p) => p.role === 'practice' || p.role === 'exam').flatMap((p) => p.units)
        .length,
    );
    await context.close();

    // Retake: it asks first and starts again at the first page. Until the
    // new attempt ends, the results send back to the lesson page.
    await learner.goto(page('/results'));
    await learner.getByRole('button', { name: 'Retake the lesson' }).click();
    await learner.getByRole('button', { name: 'Retake', exact: true }).click();
    await learner.waitForURL(/\/play$/);
    await expect(learner.locator('[data-page-index="0"]')).toBeVisible();
    await learner.goto(page('/results'));
    await expect(learner).toHaveURL(new RegExp(`${page()}$`));
    await expect(learner.getByRole('link', { name: 'Resume the lesson' })).toBeVisible();
  });

  test('keeps its place through reloads, Back and Forward', async ({ freshLearner }) => {
    const learner = freshLearner;
    const violations = watchConsole(learner);
    await placeCourse(learner, { lang: LANG, level: 'A1', dailyGoal: 10 });

    await learner.goto(page());
    await learner.getByRole('button', { name: 'Start the lesson' }).click();
    await learner.waitForURL(/\/play$/);

    // A draft survives a reload during practice.
    await playLesson(learner, plan, { stop: (index) => index === FIRST_TYPED });
    const box = learner.locator('[data-unit]').getByRole('textbox').first();
    await box.fill('brouillon');
    await learner.reload();
    expect(await pageIndex(learner)).toBe(FIRST_TYPED);
    await expect(box).toHaveValue('brouillon');

    // Back leaves the player for the lesson page; Forward shows the same page.
    await learner.goBack();
    await expect(learner).toHaveURL(new RegExp(`${page()}$`));
    await expect(learner.getByRole('link', { name: 'Resume the lesson' })).toBeVisible();
    await learner.goForward();
    await expect(learner.locator(`[data-page-index="${FIRST_TYPED}"]`)).toBeVisible();

    // On the exam: the time left never grows on a reload.
    await playLesson(learner, plan, { stop: (index) => index === FIRST_EXAM });
    await expect(learner.getByTestId('time-left')).toBeVisible();
    const before = await timeLeft(learner);
    await learner.reload();
    await expect(learner.getByTestId('time-left')).toBeVisible();
    expect(await timeLeft(learner)).toBeLessThanOrEqual(before);
    expect(await pageIndex(learner)).toBe(FIRST_EXAM);

    // Back during the exam: Resume the exam, and the timer keeps running.
    await learner.goBack();
    await expect(learner.getByRole('link', { name: 'Resume the exam' })).toBeVisible();
    await expect(
      learner.getByText('Exam in progress. The timer of the current page is running.'),
    ).toBeVisible();
    await learner.goForward();
    await expect(learner.locator(`[data-page-index="${FIRST_EXAM}"]`)).toBeVisible();

    // ✕ during the exam asks first; Keep going stays.
    await learner.getByRole('button', { name: 'Leave the lesson' }).click();
    await learner.getByRole('button', { name: 'Keep going' }).click();
    await expect(mainButton(learner)).toBeVisible();

    expect(violations, formatViolations(violations)).toEqual([]);
  });

  test('a second tab on an old page catches up with the attempt', async ({ freshLearner }) => {
    const learner = freshLearner;
    await placeCourse(learner, { lang: LANG, level: 'A1', dailyGoal: 10 });
    await start(learner);
    await playLesson(learner, plan, { stop: (index) => index === FIRST_PRACTICE });

    const other = await learner.context().newPage();
    await other.goto(page('/play'));
    await expect(other.locator(`[data-page-index="${FIRST_PRACTICE}"]`)).toBeVisible();

    // The first tab checks the page; the second still shows it, and its
    // Check gets a 409: it reads the attempt again and shows the real page.
    await answerPage(learner, plan.pages[FIRST_PRACTICE]!, () => true);
    await sendPage(learner);
    const now = await pageIndex(learner);
    await mainButton(other).click();
    await expect(other.locator(`[data-page-index="${now}"]`)).toBeVisible();
    // The player's own alert: Next.js has one too, for route changes.
    await expect(other.locator('[data-page-index]').getByRole('alert')).toBeVisible();
    await other.close();
  });

  test('posts the drafts when the countdown reaches zero', async ({ freshLearner }) => {
    const learner = freshLearner;
    await placeCourse(learner, { lang: LANG, level: 'A1', dailyGoal: 10 });
    // The tab's clock only: the server's deadline is still far, so the post counts.
    await learner.clock.install();
    await start(learner);
    await playLesson(learner, plan, { share: 0, stop: (index) => index === FIRST_EXAM });

    const exam = plan.pages[FIRST_EXAM]!;
    await answerPage(learner, exam, () => true);
    await learner.clock.fastForward(exam.timeLimitS! * 1000);
    await expect(learner.locator(`[data-page-index="${FIRST_EXAM + 1}"]`)).toBeVisible();

    // Every other exam page blank: the exam's points are that page's.
    await playLesson(learner, plan, { share: 0 });
    await expect(learner.getByRole('heading', { name: 'Your results' })).toBeVisible();
    await expect(
      learner.locator('dt', { hasText: /^Exam$/ }).locator('xpath=following-sibling::dd'),
    ).toHaveText(new RegExp(`^${exam.units.length} / \\d+$`));
  });

  test('says when the time ran out while the learner was away', async ({
    freshLearner,
    browserName,
  }) => {
    // The server's clock decides, so this waits out a real exam page. What
    // it checks is the server's and the player's, not the engine's: one
    // engine is enough for the wait.
    test.skip(browserName !== 'chromium', 'Chromium covers the wait');
    const lesson = 'fr-here-there-now-tomorrow';
    const other = lessonPlan(lesson, 'en');
    const firstExam = other.pages.findIndex((p) => p.role === 'exam');
    const limitS = other.pages[firstExam]!.timeLimitS!;
    test.setTimeout(240_000 + limitS * 1000);

    const learner = freshLearner;
    await placeCourse(learner, { lang: LANG, level: 'A1', dailyGoal: 10 });
    await start(learner, lesson);
    await playLesson(learner, other, { share: 0, stop: (index) => index === firstExam });
    await expect(learner.getByRole('timer', { name: 'Time left' })).toBeVisible();

    await learner.goBack();
    await expect(learner.getByRole('link', { name: 'Resume the exam' })).toBeVisible();
    // The page's time, the server's two seconds of grace, and some slack.
    await learner.waitForTimeout((limitS + 4) * 1000);
    await learner.getByRole('link', { name: 'Resume the exam' }).click();

    await expect(
      learner.getByText('Time ran out while you were away. This page counts as unanswered.'),
    ).toBeVisible();
    await expect(learner.locator('[data-unit] :is(input, button, select)').first()).toBeDisabled();
    await expect(learner.getByTestId('time-left')).toHaveText('0:00');
    await mainButton(learner).click();
    await expect(learner.locator(`[data-page-index="${firstExam + 1}"]`)).toBeVisible();
  });
});

test.describe('every French A1 grammar lesson', () => {
  // The renderers are the same in every engine: lesson.spec's first test
  // covers those, and here each lesson's items and matchers.
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium covers the content');
  test.describe.configure({ timeout: 240_000 });

  for (const lesson of OTHER_GRAMMAR) {
    test(`${lesson} plays to its results`, async ({ freshLearner }) => {
      const learner = freshLearner;
      const lessonPlanned = lessonPlan(lesson, 'en');
      const violations = watchConsole(learner);
      await placeCourse(learner, { lang: LANG, level: 'A1', dailyGoal: 10 });
      await start(learner, lesson);
      await playLesson(learner, lessonPlanned);

      await expect(learner.getByRole('heading', { name: 'Your results' })).toBeVisible();
      await expect(learner.getByText('Score: 100 / 100')).toBeVisible();
      expect(violations, formatViolations(violations)).toEqual([]);
    });
  }
});

test.describe('a vocabulary lesson', () => {
  test.describe.configure({ timeout: 240_000 });

  // Headless browsers have no voice: the lesson plays on without one (#147).
  test('plays to the results in a browser with no voice', async ({ freshLearner }) => {
    const learner = freshLearner;
    const lesson = VOCABULARY[0]!;
    const planned = lessonPlan(lesson, 'en');
    const violations = watchConsole(learner);
    await placeCourse(learner, { lang: LANG, level: 'A1', dailyGoal: 10 });
    await learner.goto(page('', lesson));
    await expect(learner.getByText(/^About \d+ minutes · \d+ words$/)).toBeVisible();
    await learner.getByRole('button', { name: 'Start the lesson' }).click();
    await learner.waitForURL(/\/play$/);

    // The flashcards hold Continue until every card is turned, and have no Listen button.
    const cards = planned.pages.findIndex((p) =>
      p.items.some((item) => item.type === 'vocabulary_flashcards'),
    );
    await playLesson(learner, planned, { stop: (index) => index === cards });
    await expect(learner.getByText('Flip every card to continue.')).toBeVisible();
    await expect(mainButton(learner)).toBeDisabled();
    await expect(learner.locator('[data-listen]')).toHaveCount(0);

    // Wrong answers on the exam: the first Next shows the article notes.
    const exam = planned.pages.findIndex((p) => p.role === 'exam');
    await playLesson(learner, planned, { share: 0.75, stop: (index) => index === exam });
    for (const field of await learner.locator('[data-unit] input').all()) await field.fill('zzz');
    await mainButton(learner).click();
    await expect(learner.getByText('Type the article before the word.').first()).toBeVisible();
    await expect(learner.locator(`[data-page-index="${exam}"]`)).toBeVisible();
    await sendPage(learner);
    await playLesson(learner, planned, { share: 0.75 });

    await expect(learner.getByRole('heading', { name: 'Your results' })).toBeVisible();
    await expect(learner.getByText(/^Score: \d+(\.\d)? \/ 100$/)).toBeVisible();
    expect(violations, formatViolations(violations)).toEqual([]);
  });
});

test.describe('every French A1 vocabulary lesson', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium covers the content');
  test.describe.configure({ timeout: 240_000 });

  for (const lesson of VOCABULARY) {
    test(`${lesson} plays to its results`, async ({ freshLearner }) => {
      const learner = freshLearner;
      const violations = watchConsole(learner);
      await placeCourse(learner, { lang: LANG, level: 'A1', dailyGoal: 10 });
      await start(learner, lesson);
      await playLesson(learner, lessonPlan(lesson, 'en'));

      await expect(learner.getByRole('heading', { name: 'Your results' })).toBeVisible();
      await expect(learner.getByText('Score: 100 / 100')).toBeVisible();
      expect(violations, formatViolations(violations)).toEqual([]);
    });
  }
});

test.describe('a functions lesson', () => {
  test.describe.configure({ timeout: 240_000 });

  // No voice: the dialogue plays without speakers, and Show the text answers the listening reply (#149).
  test('plays to the results in a browser with no voice, through Show the text', async ({
    freshLearner,
  }) => {
    const learner = freshLearner;
    const lesson = FUNCTIONS[0]!;
    const planned = lessonPlan(lesson, 'en');
    const violations = watchConsole(learner);
    await placeCourse(learner, { lang: LANG, level: 'A1', dailyGoal: 10 });
    await start(learner, lesson);

    // The model dialogue: Next line until its last line, then Continue.
    const dialogue = planned.pages.findIndex((p) =>
      p.items.some((item) => item.type === 'function_dialogue'),
    );
    await playLesson(learner, planned, { stop: (index) => index === dialogue });
    const lines = learner.locator('.lesson-dialogue > li');
    await expect(learner.getByText(/^Line 1 of \d+$/)).toBeVisible();
    await expect(lines).toHaveCount(1);
    await expect(learner.locator('[data-listen]')).toHaveCount(0);
    await unrollDialogue(learner);
    await expect(mainButton(learner)).toHaveText('Continue');
    expect(await lines.count()).toBeGreaterThan(1);

    // The listening reply: Reply 1 to Reply 4 until Show the text writes them out.
    const listening = planned.pages.findIndex((p) =>
      p.items.some((item) => item.type === 'function_listening_choice'),
    );
    await playLesson(learner, planned, { stop: (index) => index === listening });
    await expect(learner.getByRole('radio', { name: 'Reply 1' })).toBeVisible();
    await playLesson(learner, planned);

    await expect(learner.getByRole('heading', { name: 'Your results' })).toBeVisible();
    await expect(learner.getByText('Score: 100 / 100')).toBeVisible();
    expect(violations, formatViolations(violations)).toEqual([]);
  });
});

test.describe('every French A1 functions lesson', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium covers the content');
  test.describe.configure({ timeout: 240_000 });

  for (const lesson of FUNCTIONS) {
    test(`${lesson} plays to its results`, async ({ freshLearner }) => {
      const learner = freshLearner;
      const violations = watchConsole(learner);
      await placeCourse(learner, { lang: LANG, level: 'A1', dailyGoal: 10 });
      await start(learner, lesson);
      await playLesson(learner, lessonPlan(lesson, 'en'));

      await expect(learner.getByRole('heading', { name: 'Your results' })).toBeVisible();
      await expect(learner.getByText('Score: 100 / 100')).toBeVisible();
      expect(violations, formatViolations(violations)).toEqual([]);
    });
  }
});
