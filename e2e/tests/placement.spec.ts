import type { Page } from '@playwright/test';

import { expect, ONBOARDED_COURSE, placeCourse, test } from '../support/session';

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
    /*
     * The level is restored too, not just the run: a run that reaches its end
     * writes the verdict through setLevel, and the account is worker-scoped. Left
     * alone, the exam's level would fail course.spec.ts, which expects
     * ONBOARDED_COURSE.level — in another file, for no visible reason.
     */
    await placeCourse(onboarded, ONBOARDED_COURSE);
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
    // The bodies are collected as promises and awaited below. Reading them
    // fire-and-forget races the assertions, which then run over an empty list
    // and pass without having looked at anything.
    const reading: Promise<void>[] = [];
    onboarded.on('response', (response) => {
      if (!response.url().includes('/api/placement')) {
        return;
      }
      reading.push(
        response.text().then(
          (body) => {
            payloads.push(body);
          },
          () => {
            /* a 204 has no body to read */
          },
        ),
      );
    });

    await startRun(onboarded);

    // The answer response is the one worth checking, and it is awaited by URL:
    // networkidle can settle before it has been received, which would leave only
    // the start response under assertion.
    const answered = onboarded.waitForResponse((response) =>
      response.url().includes('/api/placement/answers'),
    );
    await options(onboarded).getByRole('button').first().click();
    await answered;
    await expect(question(onboarded)).toBeVisible();

    await Promise.all(reading);

    // Both of them: the start and the answer. One alone would mean the wait above
    // let the test through before the exam had moved on.
    expect(payloads.length).toBeGreaterThan(1);
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
   * Deliberately slow: the countdown is waited out for real. A seeded question
   * allows up to 165 seconds, hence the timeout below. The submission is now a
   * plain setTimeout rather than a side effect inside a state updater, so
   * page.clock could drive it instead — left for its own change, since a faked
   * clock has to be installed before the first navigation the fixture makes.
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

    const asked: { question: string; chosen: string }[] = [];
    const ended = onboarded.getByRole('heading', { name: 'Placement report' });

    for (let step = 0; step < 30 && !(await ended.isVisible()); step += 1) {
      const current = await question(onboarded).innerText();
      const first = options(onboarded).getByRole('button').first();
      // Read before the click: the option is gone once the exam moves on, and
      // the report has to show back what was picked.
      asked.push({ question: current, chosen: await first.innerText() });
      await first.click();

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

    for (const [index, entry] of asked.entries()) {
      const cells = report(onboarded).nth(index).locator('td');
      await expect(cells.nth(0)).toHaveText(entry.question);
      await expect(cells.nth(1)).toHaveText(entry.chosen);
      // Filled on every row, including the ones answered correctly: a blank cell
      // there leaves the learner checking their answer against nothing.
      await expect(cells.nth(2)).not.toBeEmpty();
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
  test('quitting clears the run and returns to the course', async ({ onboarded }) => {
    await startRun(onboarded);

    await onboarded.getByRole('button', { name: 'Quit test' }).click();
    // The course home, not onboarding: quitting part-way through never writes a
    // level, so the course is still placed, and CoursePage is what forwards an
    // unplaced one to /onboarding?lang=.
    await expect(onboarded).toHaveURL(new RegExp(`/learn/${ONBOARDED_COURSE.lang}$`));

    const afterQuit = await onboarded.request.get('/api/placement');
    expect(afterQuit.status()).toBe(404);
  });
});
