import type { Page } from '@playwright/test';

import { expect, ONBOARDED_COURSE, test } from '../support/session';

/**
 * The acceptance criteria of #50 that only a browser can check: that no response
 * carries the answer to the question on screen, that a reload resumes the
 * countdown rather than restarting it, that running out of time answers without
 * a click, and that the report lists every question asked, in order.
 *
 * All of it runs as the onboarded account, whose course is already placed: the
 * API refuses to start a run for a language the learner has not onboarded.
 */
const PLACEMENT = `/en/learn/${ONBOARDED_COURSE.lang}/placement`;

/**
 * A run outlives the page and there may be only one per learner across every
 * language, so each test clears it on both sides of itself. The account is
 * worker-scoped: a run left open would answer 409 to every test after this one.
 */
const clearRun = async (page: Page): Promise<void> => {
  const cleared = await page.request.delete('/api/placement');
  expect([204, 404]).toContain(cleared.status());
};

/** The countdown renders its seconds inside the timer, so this reads the clock. */
const secondsLeft = async (page: Page): Promise<number> => {
  const shown = await page.locator('[role="timer"]').innerText();
  return Number(shown.trim());
};

const question = (page: Page) => page.locator('main p.text-xl');
const options = (page: Page) => page.getByRole('group', { name: 'Answer options' });
const report = (page: Page) => page.locator('tbody tr');

const startRun = async (page: Page): Promise<void> => {
  await page.goto(PLACEMENT);
  await page.getByRole('button', { name: 'Start the test' }).click();
  await expect(question(page)).toBeVisible();
};

test.describe('placement exam', () => {
  test.beforeEach(async ({ onboarded }) => {
    await clearRun(onboarded);
  });

  test.afterEach(async ({ onboarded }) => {
    await clearRun(onboarded);
  });

  test('a signed out visitor is sent to the login page', async ({ page }) => {
    await page.goto(PLACEMENT);

    await expect(page).toHaveURL(/\/login$/);
  });

  // With no run open the page offers the start control rather than an error:
  // the API answers 404 for "nothing running", which is a verdict, not a fault.
  test('offers the start control when no run is open', async ({ onboarded }) => {
    await onboarded.goto(PLACEMENT);

    await expect(onboarded.getByRole('heading', { name: 'Evaluate your level' })).toBeVisible();
    await expect(onboarded.getByRole('button', { name: 'Start the test' })).toBeVisible();
  });

  /**
   * The QuestionBank row carries the answer, so the only guard against shipping
   * it to the browser is that nothing in the payload names it. Checked over
   * every placement response seen while a question is on screen, since the
   * report legitimately publishes `correct` only once the run has ended.
   */
  test('no response carries the answer to the question on screen', async ({ onboarded }) => {
    const payloads: string[] = [];
    onboarded.on('response', (response) => {
      if (!response.url().includes('/api/placement')) {
        return;
      }
      void response
        .text()
        .then((body) => payloads.push(body))
        .catch(() => {
          /* a 204 has no body to read */
        });
    });

    await startRun(onboarded);
    await options(onboarded).getByRole('button').first().click();
    await expect(question(onboarded)).toBeVisible();

    // networkidle is what the console gate waits on, so this also proves the
    // page settles between questions instead of polling for the clock.
    await onboarded.waitForLoadState('networkidle');

    expect(payloads.length).toBeGreaterThan(0);
    for (const body of payloads) {
      expect(body).not.toContain('"answer"');
      expect(body).not.toContain('"correct"');
    }
  });

  /**
   * The server stamps when it served the question and the browser only displays
   * the time left, so a reload has to come back lower. Coming back to the full
   * limit would mean the clock restarted, which is an unbounded exam.
   */
  test('refreshing resumes the countdown instead of restarting it', async ({ onboarded }) => {
    await startRun(onboarded);
    const before = await secondsLeft(onboarded);

    await onboarded.waitForTimeout(3000);
    await onboarded.reload();
    await expect(question(onboarded)).toBeVisible();

    expect(await secondsLeft(onboarded)).toBeLessThan(before);
  });

  /**
   * Time runs out, nobody clicks, and the exam still moves on.
   *
   * Deliberately slow: the countdown is waited out for real, because the
   * trigger lives inside a React state updater and a faked clock (page.clock)
   * advances the interval without React ever processing the update, so the
   * submission never fires and the test passes or fails for the wrong reason.
   * A seeded question allows up to 165 seconds, hence the timeout below.
   */
  test('the countdown running out answers for the learner', async ({ onboarded }) => {
    test.setTimeout(240_000);
    await startRun(onboarded);

    const asked = await question(onboarded).innerText();
    const limit = await secondsLeft(onboarded);

    await expect(question(onboarded)).not.toHaveText(asked, {
      timeout: (limit + 15) * 1000,
    });
  });

  /**
   * Every question asked comes back in the debrief, in the order it was asked,
   * each with its verdict. The run is driven to its end by always taking the
   * first option, which the binary search settles in at most a few levels.
   */
  test('the report lists every question asked, in order', async ({ onboarded }) => {
    test.setTimeout(180_000);
    await startRun(onboarded);

    const asked: string[] = [];
    const ended = onboarded.getByRole('heading', { name: 'Placement report' });

    for (let step = 0; step < 30 && !(await ended.isVisible()); step += 1) {
      const current = await question(onboarded).innerText();
      asked.push(current);
      await options(onboarded).getByRole('button').first().click();

      /*
       * Waited on positively, because both outcomes are possible and a negative
       * assertion cannot express them: another question carries different text,
       * the last answer removes the paragraph for the verdict instead. Asserting
       * the old text is gone fails outright once the element no longer exists.
       */
      const advanced = question(onboarded).filter({ hasNotText: current }).or(ended);
      await expect(advanced.first()).toBeVisible({ timeout: 15_000 });
      /*
       * An API refusal (an exhausted pool, a mismatched question) would
       * otherwise leave the loop spinning until the test timed out. Matched on
       * the paragraph FormError renders, since Next injects a route announcer
       * that also carries role="alert" on every page.
       */
      await expect(onboarded.locator('p[role="alert"]')).toBeHidden();
    }

    await expect(ended).toBeVisible();
    await expect(report(onboarded)).toHaveCount(asked.length);

    for (const [index, text] of asked.entries()) {
      await expect(report(onboarded).nth(index).locator('td').first()).toHaveText(text);
    }

    // Red and green: every row carries its verdict, named for a screen reader
    // rather than left to colour alone.
    const verdicts = onboarded.getByRole('img', { name: /^(Correct|Incorrect)$/ });
    await expect(verdicts).toHaveCount(asked.length);
  });

  /**
   * Quitting has to clear the run server-side, not just navigate away: the one
   * run per learner would otherwise block every later start until its TTL ran
   * out, with the report unreachable in the meantime.
   */
  test('quitting clears the run and returns to onboarding', async ({ onboarded }) => {
    await startRun(onboarded);

    await onboarded.getByRole('button', { name: 'Quit test' }).click();
    await expect(onboarded).toHaveURL(/\/onboarding/);

    const afterQuit = await onboarded.request.get('/api/placement');
    expect(afterQuit.status()).toBe(404);
  });
});
