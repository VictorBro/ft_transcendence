import type { Page } from '@playwright/test';

import { formatViolations, isExpectedRefusal, watchConsole } from '../support/console-guard';
import { lessonPlan, playLesson } from '../support/lesson-play';
import { expect, placeCourse, test } from '../support/session';
import { discussionSlot } from '../support/signup-budget';

/**
 * The discussion page before the exam (#151), on the stack's fixture tutor
 * (LLM_PROVIDER=fixture): it gives one fixed answer, and fails on purpose
 * when a message holds one of its words (fixture.provider.ts in apps/api).
 *
 * #150's limits hold here too: a few messages a minute per learner, so
 * each test has its own learner, and a few a minute for everyone, so each
 * message the API counts first books a slot of that (discussionSlot).
 */

const LANG = 'fr';
const LESSON = 'fr-subject-pronouns';
const plan = lessonPlan(LESSON, 'en');
const DISCUSSION = plan.pages.findIndex((p) => p.role === 'discussion');

/** The per-learner limit a minute, as make reads it from the api container; the default in CI. */
const USER_PER_MINUTE = Number(process.env.LLM_DISCUSSION_USER_PER_MINUTE || 2);

/** FIXTURE_ANSWER in apps/api/src/llm/fixture.provider.ts, its pieces joined. */
const ANSWER =
  'This is the fixture tutor. It gives the same answer to every question. Set LLM_PROVIDER=gemini for a real one.';

/** Starts the lesson and plays it, half right, up to the discussion page. */
async function openDiscussion(learner: Page) {
  await placeCourse(learner, { lang: LANG, level: 'A1', dailyGoal: 10 });
  await learner.goto(`/en/learn/${LANG}/lessons/${LESSON}`);
  await learner.getByRole('button', { name: 'Start the lesson' }).click();
  await learner.waitForURL(/\/play$/);
  await playLesson(learner, plan, { share: 0.5, stop: (index) => index === DISCUSSION });
  await expect(learner.getByRole('heading', { level: 1, name: 'Ask the tutor.' })).toBeVisible();
  return learner.getByRole('region', { name: 'Tutor' });
}

test.describe('the discussion page', () => {
  // Most of it is playing the lesson up to the page.
  test.describe.configure({ timeout: 240_000 });

  test('streams an answer, stops one, counts down after the limit, then goes to the exam', async ({
    freshLearner,
  }) => {
    const learner = freshLearner;
    const violations = watchConsole(learner);
    const tutor = await openDiscussion(learner);
    const box = tutor.getByRole('textbox', { name: 'Your question' });
    const answers = tutor.locator('[data-turn="assistant"]');

    // A suggested prompt sends at once; the answer comes piece by piece, then the box is free.
    await discussionSlot();
    await tutor.getByRole('button', { name: 'Explain my mistakes' }).click();
    await expect(answers).toHaveCount(1);
    await expect(answers).toContainText(ANSWER);
    await expect(box).toBeEnabled();

    // Stop while the answer is on its way. The request is held here, so no
    // word comes first, and the API never sees it: it uses up no limit.
    await learner.route('**/discussion', () => {});
    await box.fill('Why is it tu and not vous?');
    await tutor.getByRole('button', { name: 'Send' }).click();
    await tutor.getByRole('button', { name: 'Stop' }).click();
    // Stopped before any word: the message goes back to the box, and nothing is sent again.
    await expect(box).toHaveValue('Why is it tu and not vous?');
    await expect(box).toBeEnabled();
    await expect(answers).toHaveCount(1);
    await expect(tutor.getByRole('alert')).toHaveCount(0);
    await learner.unrouteAll({ behavior: 'ignoreErrors' });

    // The learner's other messages of the minute are answered, the next one is refused.
    for (let n = 2; n <= USER_PER_MINUTE; n += 1) {
      await discussionSlot();
      if (n > 2) await box.fill(`Question ${n}`);
      await tutor.getByRole('button', { name: 'Send' }).click();
      await expect(answers).toHaveCount(n);
    }
    await tutor.getByRole('button', { name: 'Give me another example' }).click();
    const wait = tutor.getByRole('status');
    await expect(wait).toHaveText(/^Too many questions\. Try again in \d+ s\.$/);
    await expect(box).toBeDisabled();
    await expect(tutor.getByRole('button', { name: 'Explain my mistakes' })).toBeDisabled();
    // A countdown: the seconds go down.
    const seconds = async () => Number((await wait.innerText()).match(/\d+/)![0]);
    const first = await seconds();
    await expect.poll(seconds).toBeLessThan(first);

    // Continue to the exam is there all along, and goes to the exam info page.
    await expect(learner.getByText('The tutor is not available during the exam.')).toBeVisible();
    await learner.getByRole('button', { name: 'Continue to the exam' }).click();
    await expect(learner.locator('[data-page-role="examIntro"]')).toBeVisible();

    // Chromium and WebKit log the 429 itself as a failed resource; nothing else may show.
    const unexpected = violations.filter((v) => !isExpectedRefusal(v, '/discussion', 429));
    expect(unexpected, formatViolations(unexpected)).toEqual([]);
  });

  test('keeps the answer so far when it fails, with Try again', async ({ freshLearner }) => {
    const learner = freshLearner;
    const violations = watchConsole(learner);
    const tutor = await openDiscussion(learner);
    const failed = 'The tutor cannot answer right now. Try again in a moment.';

    // Two pieces, then the fixture drops the connection.
    await discussionSlot();
    await tutor.getByRole('textbox', { name: 'Your question' }).fill('#fail-midstream');
    await tutor.getByRole('button', { name: 'Send' }).click();
    await expect(tutor.getByRole('alert')).toHaveText(failed);
    await expect(tutor.locator('[data-turn="assistant"]')).toContainText(
      'This is the fixture tutor. It gives the same answer to every question.',
    );
    // Marked as cut short, not shown as a finished answer.
    await expect(tutor.locator('[data-turn="assistant"][data-interrupted]')).toHaveCount(1);

    // Try again sends the same message: the fixture fails it the same way.
    await discussionSlot();
    const sent = learner.waitForResponse('**/discussion');
    await tutor.getByRole('button', { name: 'Try again' }).click();
    await sent;
    await expect(tutor.getByRole('alert')).toHaveText(failed);
    await expect(tutor.locator('[data-turn="user"]')).toHaveCount(1);

    expect(violations, formatViolations(violations)).toEqual([]);
  });
});
