import { devices } from '@playwright/test';
import { expectFitsTheScreen } from '../support/layout';
import { AUTHENTICATED_FOOTER_ROUTES, PUBLIC_FOOTER_ROUTES } from '../support/routes';
import { expect, ONBOARDED_COURSE, placeCourse, SECOND_COURSE, test } from '../support/session';

/**
 * 360px is the narrowest width worth gating: it is the most common Android
 * screen, and below the iPhone SE at 375. Pixel 5 supplies the rest of the
 * phone, its touch flags and its mobile user agent, with its width overridden
 * and `defaultBrowserType` left out. That last key is a worker option, so
 * spreading it would put this file in workers of its own for nothing.
 */
const { defaultBrowserType: _browser, ...phone } = devices['Pixel 5'];

test.use({ ...phone, viewport: { width: 360, height: 800 } });

/**
 * Walks the route catalogues rather than naming the screens this was written
 * for. Those were already broken; the point of a gate is that the next one
 * cannot break unnoticed, and routes.ts already promises that adding a page
 * there is what puts it behind the gates.
 *
 * Deliberately only width. A layout that is wrong in an obvious way is caught
 * by opening the page, which is now part of review; what review does not catch
 * is a page overrunning by a few pixels, a route nobody thinks to open on a
 * phone, or content shut inside a pane whose scrollbar is hidden.
 */
test.describe('every page fits a phone screen', () => {
  for (const { path, name } of PUBLIC_FOOTER_ROUTES) {
    test(`the ${name} page fits`, async ({ page }) => {
      await page.goto(path);
      await expectFitsTheScreen(page, path);
    });
  }

  for (const { path, name } of AUTHENTICATED_FOOTER_ROUTES) {
    // The onboarded account, with the longest display name allowed. Other specs
    // may add SECOND_COURSE to it, so the gate adds it too and always measures
    // the fuller header, whatever ran before it in the worker.
    test(`the ${name} page fits when signed in`, async ({ onboarded }) => {
      await placeCourse(onboarded, SECOND_COURSE);
      await onboarded.goto(path);
      await expectFitsTheScreen(onboarded, path);
    });
  }
});

/*
 * The exam's two other screens are only reached by answering, so the run is
 * faked at the network: German at its widest, a long reading passage and
 * compounds with nowhere to break, which a real draw only serves by chance.
 */
const LONG_WORDS = 'Donaudampfschifffahrtsgesellschaft Rechtsschutzversicherungsgesellschaften';
const ID = '11111111-1111-4111-8111-111111111111';
const options = [
  'Beeinträchtigungen',
  'Verantwortungsbewusstsein',
  'Geschwindigkeitsbegrenzung',
  LONG_WORDS,
];

const readingQuestion = {
  lang: ONBOARDED_COURSE.lang,
  questionId: ID,
  category: 'reading',
  level: 'B2',
  readText: `${LONG_WORDS}. `.repeat(12),
  question: `Was bedeutet ${LONG_WORDS}?`,
  options,
  timeLimitS: 120,
  remainingS: 120,
  progress: { answered: 0, maxQuestionsRemaining: 18 },
};

const result = {
  lang: ONBOARDED_COURSE.lang,
  targetLevel: 'C1',
  applied: true,
  report: [
    {
      questionId: ID,
      level: readingQuestion.level,
      question: readingQuestion.question,
      readText: readingQuestion.readText,
      options,
      chosen: options[0],
      correct: LONG_WORDS,
      wasCorrect: false,
    },
  ],
};

test('the placement question and result fit a phone screen', async ({ onboarded }) => {
  const path = `/en/learn/${ONBOARDED_COURSE.lang}/placement`;
  await onboarded.route('**/api/placement', (route) => route.fulfill({ json: readingQuestion }));
  await onboarded.route('**/api/placement/answers', (route) => route.fulfill({ json: result }));

  await onboarded.goto(path);
  await onboarded.getByRole('button', { name: 'Start the test' }).click();
  await expect(onboarded.getByRole('timer')).toBeVisible();
  await expectFitsTheScreen(onboarded, `${path} (question)`);

  await onboarded.getByRole('button', { name: options[0] }).click();
  await expect(onboarded.getByRole('heading', { name: 'Your result' })).toBeVisible();
  await expectFitsTheScreen(onboarded, `${path} (result)`);
});
