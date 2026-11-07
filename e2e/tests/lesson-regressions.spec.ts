import { expectFitsTheScreen } from '../support/layout';
import { answerPage, lessonPlan, playLesson, finishThroughApi } from '../support/lesson-play';
import { expect, placeCourse, test } from '../support/session';

const API = '/api/courses/fr/lessons/fr-subject-pronouns/attempt';
const LESSON = '/en/learn/fr/lessons/fr-subject-pronouns';

test('an old exam refresh cannot rewind a submitted page', async ({ freshLearner }) => {
  await placeCourse(freshLearner, { lang: 'fr', level: 'A1', dailyGoal: 10 });
  const request = freshLearner.request;
  const started = await request.post(API, { data: { locale: 'en' } });
  expect(started.status()).toBe(201);
  let attempt = await started.json();
  // Blank answers are valid. Only the transition into the exam matters here.
  while (attempt.current.role !== 'exam') {
    const response = await request.post(`${API}/pages/${attempt.current.index}`, {
      data: { attemptId: attempt.attemptId, answers: {} },
    });
    expect(response.status()).toBe(200);
    attempt = (await response.json()).attempt;
  }
  const index: number = attempt.current.index;
  let release!: () => void;
  let captured!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const readCaptured = new Promise<void>((resolve) => {
    captured = resolve;
  });

  await freshLearner.route(`**${API}`, async (route) => {
    const response = await route.fetch();
    captured();
    await hold;
    await route.fulfill({ response });
  });
  try {
    await freshLearner.goto(`${LESSON}/play`);
    await readCaptured;
    await freshLearner.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(freshLearner.locator(`[data-page-index="${index + 1}"]`)).toBeVisible();

    const readFinished = freshLearner.waitForEvent('requestfinished', {
      predicate: (request) => request.url().endsWith(API),
    });
    release();
    await readFinished;
    // Let the late response's promise handlers and resulting React render finish.
    await freshLearner.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    await expect(freshLearner.locator('[data-page-index]')).toHaveAttribute(
      'data-page-index',
      `${index + 1}`,
    );
    const server = (await (await request.get(API)).json()).attempt;
    expect(server.current.index).toBe(index + 1);
  } finally {
    release();
    await freshLearner.unroute(`**${API}`);
  }
});

test('results fragments select one part across navigation and without JavaScript', async ({
  freshLearner,
  browser,
}) => {
  await placeCourse(freshLearner, { lang: 'fr', level: 'A1', dailyGoal: 10 });
  const attempt = await finishThroughApi(freshLearner.request, 'fr', 'fr-subject-pronouns');
  const steps = attempt.results!.steps;
  const practice = steps.flatMap((step, index) => (step.role === 'practice' ? [index] : []));
  expect(practice.length).toBeGreaterThan(1);
  const first = practice[0]! + 1;
  const second = practice[1]! + 1;
  const exam = steps.findIndex((step) => step.role === 'exam') + 1;
  const url = `${LESSON}/results`;
  const onlyPart = async (part: number) => {
    await expect(freshLearner.locator('.lesson-result-panel:visible')).toHaveCount(1);
    await expect(freshLearner.locator(`#part-${part}`)).toBeVisible();
    await expect(freshLearner.locator(`nav a[href="#part-${part}"]`).first()).toHaveAttribute(
      'aria-current',
      'true',
    );
  };

  await freshLearner.goto(`${url}#part-${first}`);
  await onlyPart(first);
  await freshLearner.locator(`nav a[href="#part-${second}"]`).click();
  await expect(freshLearner).toHaveURL(new RegExp(`#part-${second}$`));
  await onlyPart(second);
  await freshLearner.goBack();
  await onlyPart(first);
  await freshLearner.goForward();
  await onlyPart(second);
  await freshLearner.reload();
  await onlyPart(second);
  await freshLearner.goto(`${url}#part-999`);
  await onlyPart(exam);

  const noScriptContext = await browser.newContext({
    storageState: await freshLearner.context().storageState(),
    javaScriptEnabled: false,
    ignoreHTTPSErrors: true,
  });
  try {
    const noScript = await noScriptContext.newPage();
    await noScript.goto(new URL(`${url}#part-${first}`, freshLearner.url()).toString());
    await expect(noScript.locator('.lesson-result-panel:visible')).toHaveCount(1);
    await expect(noScript.locator(`#part-${first}`)).toBeVisible();
    await noScript.locator(`nav a[href="#part-${second}"]`).click();
    await expect(noScript.locator('.lesson-result-panel:visible')).toHaveCount(1);
    await expect(noScript.locator(`#part-${second}`)).toBeVisible();
    await noScript.goBack();
    await expect(noScript.locator(`#part-${first}`)).toBeVisible();
  } finally {
    await noScriptContext.close();
  }
});

test('matching curves stay editable and have compact phone pair markers', async ({
  freshLearner,
}) => {
  test.setTimeout(120_000);
  const learner = freshLearner;
  await learner.setViewportSize({ width: 1440, height: 1000 });
  await placeCourse(learner, { lang: 'fr', level: 'A1', dailyGoal: 10 });
  const matchingLesson = 'fr-verb-etre-present';
  await learner.goto(`/en/learn/fr/lessons/${matchingLesson}`);
  await learner.getByRole('button', { name: 'Start the lesson' }).click();
  await learner.waitForURL(/\/play$/);
  const plan = lessonPlan(matchingLesson);
  const matching = plan.pages.findIndex((page) =>
    page.items.some((item) => item.type === 'grammar_person_matching'),
  );
  await playLesson(learner, plan, { stop: (index) => index === matching });
  const board = learner.locator('.lesson-matching');
  const left = board.locator('[data-option]');
  const right = board.locator('[data-unit] button');
  await left.first().click();
  const frame = await board.locator('.lesson-matching-frame').boundingBox();
  expect(frame).not.toBeNull();
  await learner.mouse.move(frame!.x + frame!.width / 2, frame!.y + 100);
  await expect(board.locator('path.is-preview')).toBeVisible();
  await right.first().click();
  await expect(board.locator('path[data-pair]')).toHaveCount(1);
  await expect(board.locator('path.is-preview')).toHaveCount(0);
  // Replace the partner of a filled box, then move that option to another box.
  await left.nth(1).click();
  await right.first().click();
  await expect(left.first()).not.toHaveClass(/is-paired/);
  await left.nth(1).click();
  await right.nth(1).click();
  await expect(right.first()).not.toHaveClass(/is-paired/);
  await expect(board.locator('path[data-pair]')).toHaveCount(1);
  // Either side may be selected first, using only the keyboard.
  await right.first().focus();
  await learner.keyboard.press('Enter');
  await left.first().focus();
  await learner.keyboard.press('Enter');
  await expect(board.locator('path[data-pair]')).toHaveCount(2);
  // Cross the two pairs so both curves span different rows.
  await left.first().click();
  await right.nth(1).click();
  await left.nth(1).click();
  await right.first().click();
  await expect(board.locator('path[data-pair]')).toHaveCount(2);
  await expect(board.locator('path[data-pair]').first()).toBeVisible();
  await expect(board.getByRole('status')).toContainText(
    `2 of ${plan.pages[matching]!.units.length} pairs assigned`,
  );
  await learner.screenshot({
    path: test.info().outputPath('matching-desktop.png'),
    fullPage: true,
  });
  await learner.setViewportSize({ width: 360, height: 800 });
  await expect(board.locator('.lesson-match-curves')).toBeHidden();
  await expect(board.locator('.lesson-pair-badge:visible')).toHaveCount(4);
  const firstLeft = await left.first().boundingBox();
  const firstRight = await right.first().boundingBox();
  expect(firstRight!.x).toBeGreaterThan(firstLeft!.x + firstLeft!.width);
  expect(Math.abs(firstLeft!.y - firstRight!.y)).toBeLessThan(2);
  await expectFitsTheScreen(learner, 'matching board');
  await learner.screenshot({ path: test.info().outputPath('matching-phone.png'), fullPage: true });
});

test('practice choices stack and corrections stay beside typed answers', async ({
  freshLearner,
}) => {
  test.setTimeout(120_000);
  const learner = freshLearner;
  await learner.setViewportSize({ width: 1440, height: 1000 });
  await placeCourse(learner, { lang: 'fr', level: 'A1', dailyGoal: 10 });
  await learner.goto(LESSON);
  await learner.getByRole('button', { name: 'Start the lesson' }).click();
  await learner.waitForURL(/\/play$/);
  const plan = lessonPlan('fr-subject-pronouns');
  const choice = plan.pages.findIndex(
    (page) =>
      page.role === 'practice' && page.items.some((item) => item.type === 'grammar_gap_choice'),
  );
  const typed = plan.pages.findIndex(
    (page) =>
      page.role === 'practice' && page.items.some((item) => item.type === 'grammar_gap_typing'),
  );
  await playLesson(learner, plan, { stop: (index) => index === choice });
  const radios = learner.getByRole('radio');
  const first = await radios.nth(0).boundingBox();
  const second = await radios.nth(1).boundingBox();
  expect(Math.abs(first!.x - second!.x)).toBeLessThan(2);
  expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height);
  await answerPage(learner, plan.pages[choice]!, () => false);
  await learner.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(learner.locator('[data-state="checked"]')).toBeVisible();
  await expect(learner.locator('[role="radio"].text-green-200')).toHaveCount(1);
  await expect(learner.locator('.lesson-item')).not.toContainText('Answer:');
  await expect(
    learner.locator('.lesson-item p').filter({ hasText: /^(Correct|Incorrect)$/ }),
  ).toHaveCount(0);
  await learner.screenshot({ path: test.info().outputPath('choice-feedback.png'), fullPage: true });
  await learner.getByRole('button', { name: 'Continue', exact: true }).click();
  await playLesson(learner, plan, { stop: (index) => index === typed });
  await learner.getByRole('textbox').first().fill('zzz');
  await learner.getByRole('button', { name: 'Check', exact: true }).click();
  const correction = learner.locator('[data-inline-answer]').first();
  await expect(correction).toHaveText(`Correct: ${plan.pages[typed]!.units[0]!.answer}`);
  await learner.screenshot({ path: test.info().outputPath('typed-feedback.png'), fullPage: true });
  const inputBox = await learner.getByRole('textbox').first().boundingBox();
  const correctionBox = await correction.boundingBox();
  expect(correctionBox!.x).toBeGreaterThan(inputBox!.x + inputBox!.width);
  expect(
    Math.abs(correctionBox!.y + correctionBox!.height / 2 - inputBox!.y - inputBox!.height / 2),
  ).toBeLessThan(4);
  await expect(learner.locator('.lesson-item')).not.toContainText('Answer:');
  await expect(
    learner.locator('.lesson-item p').filter({ hasText: /^(Correct|Incorrect)$/ }),
  ).toHaveCount(0);
});
