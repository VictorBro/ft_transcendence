import { finishThroughApi } from '../support/lesson-play';
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
