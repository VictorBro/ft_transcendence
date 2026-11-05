import type { Page } from '@playwright/test';

import { formatViolations, watchConsole } from '../support/console-guard';
import { expectFitsTheScreen } from '../support/layout';
import { lessonPlan, mainButton, pageIndex, playLesson } from '../support/lesson-play';
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
const page = (suffix = '') => `/en/learn/${LANG}/lessons/${LESSON}${suffix}`;
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
    await learner.goto(page('/results'));
    await learner.reload();
    await expect(learner.getByRole('heading', { name: 'Your results' })).toBeVisible();
    await learner.goto(`/en/learn/${LANG}`);
    await expect(learner.getByText(plan.title).first()).toBeVisible();

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
});
