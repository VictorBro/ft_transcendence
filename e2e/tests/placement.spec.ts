import type { Locator, Page } from '@playwright/test';

import { expectPinned } from '../support/layout';
import {
  courseLevel,
  enrol,
  expect,
  ONBOARDED_COURSE,
  placeCourse,
  SECOND_COURSE,
  test,
} from '../support/session';

/**
 * The acceptance criteria of #50 that only a browser can check: that no response
 * carries the answer to the question on screen, that a reload resumes the
 * countdown rather than restarting it, that running out of time answers without
 * a click, and that the report lists every question asked, in order.
 *
 * All of it but the unplaced course runs as the onboarded account, whose course
 * is already placed: the API refuses to start a run for a language the learner
 * has not onboarded.
 */
const PLACEMENT = `/en/learn/${ONBOARDED_COURSE.lang}/placement`;

/**
 * A run outlives the page and only one may be live per learner, in any
 * language, so each test clears it on both sides of itself. The account is
 * worker-scoped: a run left live would answer 409 to every later start.
 */
const clearRun = async (page: Page): Promise<void> => {
  const cleared = await page.request.delete('/api/placement');
  expect([204, 404]).toContain(cleared.status());
};

/** The countdown renders its seconds inside the timer, so this reads the clock. */
const secondsLeft = async (page: Page): Promise<number> =>
  Number((await page.getByRole('timer').innerText()).trim());

const options = (page: Page) => page.getByRole('group', { name: 'Answer options' });
const result = (page: Page) => page.getByRole('heading', { name: 'Your result' });
const answers = (page: Page) =>
  page.getByRole('region', { name: /^Your latest exam result/ }).getByRole('listitem');

/** One answer of a finished run, as GET /api/placement reports it. */
interface ReportEntry {
  questionId: string;
  level: string;
  question: string;
  chosen: string | null;
  correct: string;
  wasCorrect: boolean;
}

/**
 * Checks a row of the debrief against the API's entry for it. The verdict comes
 * from the API, never from the row, which could otherwise agree with itself.
 */
const expectAnswer = async (row: Locator, entry: ReportEntry): Promise<void> => {
  await expect(row.getByText(entry.question, { exact: true })).toBeVisible();
  // Named for a screen reader, not left to colour alone.
  await expect(row.getByRole('img')).toHaveAccessibleName(
    entry.wasCorrect ? 'Correct' : 'Incorrect',
  );

  const chosen = row.getByRole('definition').first();
  await expect(chosen).toHaveText(entry.chosen ?? 'Out of time');
  await expect(chosen).toHaveClass(entry.wasCorrect ? /text-green-400/ : /text-red-400/);
  // A wrong answer comes with the right one to revise from.
  if (entry.wasCorrect) {
    await expect(row.getByRole('definition')).toHaveCount(1);
  } else {
    await expect(row.getByRole('definition').nth(1)).toHaveText(entry.correct);
  }

  // The eye gets the code, a screen reader what it means, and never both.
  const code = row.getByText(entry.level, { exact: true });
  await expect(code).toBeVisible();
  await expect(code).toHaveAttribute('aria-hidden', 'true');
  await expect(row.getByText(`Level ${entry.level}`, { exact: true })).toBeAttached();
};

/**
 * Does whatever answers the question on screen, then waits until the page shows
 * what the API sent back. Generated reading questions can share a stem, so the
 * options, not the heading, say the exam moved on. A refusal fails here rather
 * than leaving a caller's loop spinning.
 */
const answer = async (
  page: Page,
  act: () => Promise<unknown>,
): Promise<{ questionId: string; choice: string | null; report?: ReportEntry[] }> => {
  const answered = page.waitForResponse((response) =>
    response.url().endsWith('/api/placement/answers'),
  );
  await act();
  const response = await answered;
  expect(response.status()).toBe(201);
  const next = await response.json();
  if (next.report === undefined) {
    await expect(options(page).getByRole('button')).toHaveText(next.options);
  } else {
    await expect(result(page)).toBeVisible();
  }
  const { questionId, choice } = response.request().postDataJSON();
  return { questionId, choice, report: next.report };
};

const startRun = async (page: Page): Promise<void> => {
  await page.goto(PLACEMENT);
  await page.getByRole('button', { name: 'Start the test' }).click();
  await expect(options(page)).toBeVisible();
};

interface Step {
  lang: string;
  targetLevel?: string;
  applied?: boolean;
  report?: ReportEntry[];
  questionId?: string;
  options?: string[];
}

/** What a run sends for each question. Null is a timeout, as the countdown sends it. */
type Choose = (step: Step) => string | null | undefined;
const firstOption: Choose = (step) => step.options?.[0];
const timeOut: Choose = () => null;

/**
 * The rest of a run through the API, always the first option unless told
 * otherwise: the tests that need a finished run are about what comes after it.
 * Bounded, so a refusal ends the loop instead of spinning.
 */
const completeRun = async (page: Page, from: Step, choose = firstOption): Promise<Step> => {
  let step = from;
  for (let i = 0; i < 30 && step.questionId !== undefined; i += 1) {
    const data = { questionId: step.questionId, choice: choose(step) };
    step = await (await page.request.post('/api/placement/answers', { data })).json();
  }
  expect(step).toHaveProperty('targetLevel');
  return step;
};

/** Answers every question on screen with its first option, through the page. */
const answerRunOnPage = async (page: Page): Promise<void> => {
  for (let i = 0; i < 30; i += 1) {
    const first = options(page).getByRole('button').first();
    if ((await answer(page, () => first.click())).report !== undefined) return;
  }
};

/** Lets every question on screen run out, on a clock the test installed. */
const timeOutRunOnPage = async (page: Page): Promise<void> => {
  for (let i = 0; i < 30; i += 1) {
    const limit = await secondsLeft(page);
    if ((await answer(page, () => page.clock.fastForward(limit * 1000))).report !== undefined) {
      return;
    }
  }
};

const finishRun = async (
  page: Page,
  lang: string = ONBOARDED_COURSE.lang,
  choose = firstOption,
): Promise<Step> =>
  completeRun(
    page,
    await (await page.request.post('/api/placement', { data: { lang } })).json(),
    choose,
  );

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
     * ONBOARDED_COURSE.level, in another file, for no visible reason.
     */
    await placeCourse(onboarded, ONBOARDED_COURSE);
  });

  test('a signed out visitor is sent to the login page', async ({ page }) => {
    await page.goto(PLACEMENT);

    await expect(page).toHaveURL(/\/login$/);
  });

  // The API answers 404 for "nothing running", which is a verdict, not a fault.
  test('offers the start control when no run is open', async ({ onboarded }) => {
    await onboarded.goto(PLACEMENT);

    await expect(onboarded.getByRole('heading', { name: 'Find your level' })).toBeVisible();
    await expect(onboarded.getByText(/reading in German\./)).toBeVisible();
    // A placed learner hears that finishing replaces the level they have.
    await expect(
      onboarded.getByText('Your lessons are at B1 now.', { exact: false }),
    ).toBeVisible();
    await expect(onboarded.getByRole('button', { name: 'Start the test' })).toBeVisible();
    await expect(onboarded.getByRole('link', { name: 'Back' })).toHaveAttribute(
      'href',
      `/en/learn/${ONBOARDED_COURSE.lang}`,
    );
  });

  /**
   * Onboarding sends a course with no level here, and Back has to return there:
   * the course page does not open without a level. With no level to replace,
   * the warning about it stays out.
   */
  test('a course with no level yet goes back to its onboarding step', async ({ freshLearner }) => {
    await enrol(freshLearner, ONBOARDED_COURSE.lang, ONBOARDED_COURSE.dailyGoal);
    await freshLearner.goto(PLACEMENT);

    await expect(freshLearner.getByRole('button', { name: 'Start the test' })).toBeVisible();
    await expect(freshLearner.getByText('Your lessons are at', { exact: false })).toBeHidden();
    await freshLearner.getByRole('link', { name: 'Back' }).click();

    await expect(freshLearner).toHaveURL(
      new RegExp(`/en/onboarding\\?lang=${ONBOARDED_COURSE.lang}$`),
    );
  });

  /**
   * Faked, because a real refusal needs a live run, which the page would resume
   * instead of offering to start. The learner stays put, told why, free to retry.
   */
  test('a refused start says why and offers the start again', async ({ onboarded }) => {
    await onboarded.route('**/api/placement', (route) =>
      route.fulfill({ status: 409, json: { message: 'placement.inProgress' } }),
    );
    await onboarded.goto(PLACEMENT);

    await onboarded.getByRole('button', { name: 'Start the test' }).click();

    await expect(
      onboarded.getByText('A placement test is already running. Finish it first.'),
    ).toBeVisible();
    await expect(onboarded.getByRole('button', { name: 'Start the test' })).toBeEnabled();
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
    await expect(options(onboarded)).toBeVisible();

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
   * limit would mean the clock restarted, which is an unbounded exam. The server
   * counts whole seconds, so a second and a half is always enough to show.
   */
  test('refreshing resumes the countdown instead of restarting it', async ({ onboarded }) => {
    await startRun(onboarded);
    const before = await secondsLeft(onboarded);

    await onboarded.waitForTimeout(1_500);
    await onboarded.reload();
    await expect(options(onboarded)).toBeVisible();

    expect(await secondsLeft(onboarded)).toBeLessThan(before);
  });

  /**
   * Time runs out, nobody clicks, and the exam still moves on. The browser's
   * clock is faked, so no question's limit is waited out for real; the server
   * scores a null as a timeout whenever it arrives, which its own tests cover.
   */
  test('the countdown running out answers for the learner', async ({ onboarded }) => {
    await onboarded.clock.install();
    await startRun(onboarded);
    const limit = await secondsLeft(onboarded);

    const next = await answer(onboarded, () => onboarded.clock.fastForward(limit * 1000));

    expect(next.choice).toBeNull();
  });

  /**
   * A timeout has no choice to show back, so its row says so rather than leave
   * the answer blank. The rest of the run goes through the API, and the report
   * is read from a fresh load, as a learner coming back to it would see it.
   */
  test('a question left to run out reads as out of time in the report', async ({ onboarded }) => {
    await onboarded.clock.install();
    await startRun(onboarded);
    const limit = await secondsLeft(onboarded);
    const timedOut = await answer(onboarded, () => onboarded.clock.fastForward(limit * 1000));

    const current = await (await onboarded.request.get('/api/placement')).json();
    const { report = [] } = await completeRun(onboarded, current);
    await onboarded.goto(PLACEMENT);

    expect(report[0]).toMatchObject({ questionId: timedOut.questionId, chosen: null });
    await expectAnswer(answers(onboarded).first(), report[0]);
  });

  /**
   * Every question asked comes back in the debrief, in the order it was asked,
   * each with its verdict and level. The run is driven to its end by always
   * taking the first option, which the binary search settles in at most a few
   * levels. The answers posted say what was asked; the API's report says what
   * each row must show.
   */
  test('the report lists every question asked, in order', async ({ onboarded }) => {
    // Up to 18 answers (three levels of six questions), each a round trip:
    // past the 30s default once workers share the stack.
    test.setTimeout(120_000);
    await startRun(onboarded);

    const asked: { questionId: string; chosen: string | null }[] = [];

    for (let step = 0; step < 30; step += 1) {
      const next = await answer(onboarded, () =>
        options(onboarded).getByRole('button').first().click(),
      );
      asked.push({ questionId: next.questionId, chosen: next.choice });
      if (next.report !== undefined) break;
    }

    const { report }: { report: ReportEntry[] } = await (
      await onboarded.request.get('/api/placement')
    ).json();
    expect(report.map(({ questionId, chosen }) => ({ questionId, chosen }))).toEqual(asked);

    const correct = report.filter((entry) => entry.wasCorrect).length;
    await expect(
      onboarded.getByText(`${correct} of ${report.length} correct`, { exact: true }),
    ).toBeVisible();
    await expect(answers(onboarded)).toHaveCount(report.length);
    for (const [index, entry] of report.entries()) {
      await expectAnswer(answers(onboarded).nth(index), entry);
    }
    // A long report scrolls inside its pane, never the page around it.
    await expectPinned(onboarded, PLACEMENT);

    // Ended right here, so the way out goes on. Found again from the course
    // page, the same report leads back instead.
    await onboarded.getByRole('link', { name: 'Continue' }).click();
    await expect(onboarded).toHaveURL(new RegExp(`/learn/${ONBOARDED_COURSE.lang}` + '$'));
    await onboarded.getByRole('link', { name: 'Take the placement test' }).click();
    await expect(result(onboarded)).toBeVisible();
    await expect(onboarded.getByRole('link', { name: 'Back to course' })).toBeVisible();
    await expect(onboarded.getByRole('link', { name: 'Continue' })).toBeHidden();
  });

  /**
   * The picker asks what the learner has mastered, as onboarding does, so the
   * course lands one level above the pick. It opens on what the current level
   * stands for, which is why Save starts disabled.
   */
  test('the result can be changed without retaking the test, and a reload keeps it', async ({
    onboarded,
  }) => {
    const { targetLevel } = await finishRun(onboarded);
    const [pick, expected] = targetLevel === 'C1' ? ['A1', 'A2'] : ['B2', 'C1'];
    await onboarded.goto(PLACEMENT);

    await onboarded.getByRole('button', { name: 'Not your level?' }).click();
    const save = onboarded.getByRole('button', { name: 'Save' });
    await expect(save).toBeDisabled();
    await expectPinned(onboarded, PLACEMENT);
    // The radio is sr-only, so its own label takes the click.
    await onboarded
      .getByRole('group', { name: 'Your level' })
      .getByText(pick, { exact: true })
      .click();
    await save.click();

    await expect(onboarded.getByRole('group', { name: 'Your level' })).toBeHidden();
    // The sentence, since the ladder above it names every level too.
    await expect(onboarded.getByText(`Your lessons will be at ${expected}.`)).toBeVisible();
    expect(await courseLevel(onboarded, ONBOARDED_COURSE.lang)).toBe(expected);
    // A new level changes where the course is taught, not the way back to it.
    await expect(onboarded.getByRole('link', { name: 'Back to course' })).toHaveAttribute(
      'href',
      `/en/learn/${ONBOARDED_COURSE.lang}`,
    );

    // The report outlives the change, but the level over it is the course's now.
    await onboarded.reload();
    await expect(result(onboarded)).toBeVisible();
    await expect(onboarded.getByText(`Your lessons will be at ${expected}.`)).toBeVisible();
  });

  /**
   * Walking away from an open run times out every question, which measures
   * nothing. The course keeps its level, so the result says so in place of a
   * level to change, and the link leads back to the course as it was.
   */
  test('a run where every question timed out leaves the level alone', async ({ onboarded }) => {
    const { applied, report = [] } = await finishRun(onboarded, ONBOARDED_COURSE.lang, timeOut);
    await onboarded.goto(PLACEMENT);

    expect(applied).toBe(false);
    await expect(
      onboarded.getByText(
        `Time ran out on every question, so your course stays at ${ONBOARDED_COURSE.level}.`,
      ),
    ).toBeVisible();
    // The sentence under the level card, which names the course it would teach.
    await expect(onboarded.getByText(/Your lessons will be at/)).toBeHidden();
    await expect(onboarded.getByRole('button', { name: 'Not your level?' })).toBeHidden();
    await expect(answers(onboarded)).toHaveCount(report.length);
    await expect(onboarded.getByRole('button', { name: 'Retake the test' })).toBeVisible();
    expect(await courseLevel(onboarded, ONBOARDED_COURSE.lang)).toBe(ONBOARDED_COURSE.level);

    await onboarded.getByRole('link', { name: 'Back to course' }).click();
    await expect(onboarded).toHaveURL(new RegExp(`/learn/${ONBOARDED_COURSE.lang}$`));
  });

  /**
   * The course page does not open without a level, so the way on is to choose
   * one in onboarding. Then the page itself places the course and the next run
   * times out: the notice must name the level written on this page, with no
   * reload.
   */
  test('a run where every question timed out sets no level on a new course, nor undoes one', async ({
    freshLearner,
  }) => {
    test.setTimeout(120_000);
    await freshLearner.clock.install();
    await enrol(freshLearner, ONBOARDED_COURSE.lang, ONBOARDED_COURSE.dailyGoal);
    await finishRun(freshLearner, ONBOARDED_COURSE.lang, timeOut);
    await freshLearner.goto(PLACEMENT);

    await expect(
      freshLearner.getByText(
        'Time ran out on every question, so no level was set. Retake the test, or choose your level yourself.',
      ),
    ).toBeVisible();
    expect(await courseLevel(freshLearner, ONBOARDED_COURSE.lang)).toBeNull();
    await expect(freshLearner.getByRole('link', { name: 'Choose your level' })).toHaveAttribute(
      'href',
      `/en/onboarding?lang=${ONBOARDED_COURSE.lang}`,
    );

    await freshLearner.getByRole('button', { name: 'Retake the test' }).click();
    await answerRunOnPage(freshLearner);
    const placed = await courseLevel(freshLearner, ONBOARDED_COURSE.lang);
    expect(placed).not.toBeNull();

    await freshLearner.getByRole('button', { name: 'Retake the test' }).click();
    await timeOutRunOnPage(freshLearner);

    await expect(
      freshLearner.getByText(`Time ran out on every question, so your course stays at ${placed}.`),
    ).toBeVisible();
    await freshLearner.getByRole('link', { name: 'Continue' }).click();
    await expect(freshLearner).toHaveURL(new RegExp(`/learn/${ONBOARDED_COURSE.lang}$`));
  });

  /**
   * Quitting has to clear the run server-side, not just navigate away: a live
   * run blocks every start and a reload resumes it. It throws the answers away,
   * so it asks first.
   */
  test('quitting asks first, then clears the run and returns to the course', async ({
    onboarded,
  }) => {
    await startRun(onboarded);
    const dialog = onboarded.getByRole('dialog', { name: 'Quit the test' });

    await onboarded.getByRole('button', { name: 'Quit the test' }).click();
    await dialog.getByRole('button', { name: 'Keep going' }).click();
    await expect(dialog).toBeHidden();
    await expect(options(onboarded)).toBeVisible();

    await onboarded.getByRole('button', { name: 'Quit the test' }).click();
    await dialog.getByRole('button', { name: 'Quit', exact: true }).click();

    await expect(onboarded).toHaveURL(new RegExp(`/learn/${ONBOARDED_COURSE.lang}$`));
    expect((await onboarded.request.get('/api/placement')).status()).toBe(404);
  });

  // Expired or quit in another tab while the dialog was open: as good as quit.
  test('quitting a run that is already gone still returns to the course', async ({ onboarded }) => {
    await startRun(onboarded);
    await onboarded.getByRole('button', { name: 'Quit the test' }).click();
    await clearRun(onboarded);

    await onboarded
      .getByRole('dialog', { name: 'Quit the test' })
      .getByRole('button', { name: 'Quit', exact: true })
      .click();

    await expect(onboarded).toHaveURL(new RegExp(`/learn/${ONBOARDED_COURSE.lang}$`));
  });

  /**
   * A finished run blocks nothing: the link to the course leaves the report for
   * a later visit to find, and Retake replaces it on the spot rather than after
   * the hour the run is kept for. Found again, the report leads back rather than
   * on: the learner already went on once.
   */
  test('a finished run is retaken without waiting', async ({ onboarded }) => {
    await finishRun(onboarded);
    await onboarded.goto(PLACEMENT);

    await onboarded.getByRole('link', { name: 'Back to course' }).click();
    await expect(onboarded).toHaveURL(new RegExp(`/learn/${ONBOARDED_COURSE.lang}$`));

    await onboarded.getByRole('link', { name: 'Take the placement test' }).click();
    await expect(result(onboarded)).toBeVisible();
    await expect(onboarded.getByRole('link', { name: 'Continue' })).toBeHidden();
    await expect(onboarded.getByRole('link', { name: 'Back to course' })).toBeVisible();
    await onboarded.getByRole('button', { name: 'Retake the test' }).click();

    await expect(options(onboarded)).toBeVisible();
    const retake = await (await onboarded.request.get('/api/placement')).json();
    expect(retake).toMatchObject({ lang: ONBOARDED_COURSE.lang, progress: { answered: 0 } });
  });

  /** A run that expired or was dropped leaves Start, not a dead question. */
  test('a run gone from under the page goes back to the start', async ({ onboarded }) => {
    await startRun(onboarded);
    await clearRun(onboarded);

    await options(onboarded).getByRole('button').first().click();

    await expect(onboarded.getByRole('heading', { name: 'Find your level' })).toBeVisible();
    await expect(onboarded.getByText('No placement test is running')).toBeVisible();
  });

  /*
   * One live run per learner, whatever the language: a live one is where the
   * learner belongs, and a finished one elsewhere is only a report that this
   * page's start replaces. afterEach makes ONBOARDED_COURSE active again.
   */
  test('a live run in another language takes the page to it', async ({ onboarded }) => {
    await placeCourse(onboarded, SECOND_COURSE);
    await startRun(onboarded);

    await onboarded.goto(`/en/learn/${SECOND_COURSE.lang}/placement`);

    await expect(onboarded).toHaveURL(new RegExp(`/learn/${ONBOARDED_COURSE.lang}/placement$`));
    await expect(options(onboarded)).toBeVisible();
  });

  test('a finished run in another language leaves the start to this page', async ({
    onboarded,
  }) => {
    await placeCourse(onboarded, SECOND_COURSE);
    await finishRun(onboarded);

    await onboarded.goto(`/en/learn/${SECOND_COURSE.lang}/placement`);
    await onboarded.getByRole('button', { name: 'Start the test' }).click();

    await expect(options(onboarded)).toBeVisible();
    const run = await (await onboarded.request.get('/api/placement')).json();
    expect(run.lang).toBe(SECOND_COURSE.lang);
  });
});
