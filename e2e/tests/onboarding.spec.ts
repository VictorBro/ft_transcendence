import type { Page } from '@playwright/test';

import { expect, test } from '../support/session';

// `freshLearner`, not the shared account: only a new account has no courses.

/** The radio is sr-only, so its own label intercepts a click aimed at it. */
const pick = (page: Page, group: string, option: string) =>
  page.getByRole('group', { name: group }).getByText(option, { exact: true }).click();

const startCourse = async (page: Page, language: string, goal: string) => {
  await page.goto('/en/onboarding');
  await pick(page, 'Language to learn', language);
  await pick(page, 'Daily goal', goal);
  await page.getByRole('button', { name: 'Next' }).click();
};

const startGermanCourse = (page: Page, goal: string) => startCourse(page, 'Deutsch', goal);

/** Step two, taking the manual route rather than the placement exam. */
const setLevel = async (page: Page, level: string) => {
  await page.getByRole('button', { name: 'I already know my level' }).click();
  await pick(page, 'Level', level);
  await page.getByRole('button', { name: 'Start learning' }).click();
  // The click returns before the handler does: it holds for the launch
  // animation, then writes the level and leaves for the course. Navigating in
  // that window cancels the write, and onboarding stays pinned on this step
  // with no language form to go back to.
  await page.waitForURL('**/learn/**');
};

test.describe('onboarding', () => {
  test('a learner with no courses starts at the language step', async ({ freshLearner }) => {
    await freshLearner.goto('/en/onboarding');

    await expect(
      freshLearner.getByRole('heading', { name: 'What do you want to learn?' }),
    ).toBeVisible();
  });

  /** A step held in React state would send the learner back to step one. */
  test('refreshing at the level step keeps the language and the daily goal', async ({
    freshLearner,
  }) => {
    await startGermanCourse(freshLearner, '30 min');

    await expect(freshLearner.getByRole('heading', { name: 'Deutsch' })).toBeVisible();
    await expect(freshLearner.getByText('Daily goal: 30 min')).toBeVisible();

    await freshLearner.reload();

    await expect(freshLearner.getByRole('heading', { name: 'Deutsch' })).toBeVisible();
    await expect(freshLearner.getByText('Daily goal: 30 min')).toBeVisible();
  });

  test('switching to setting the level yourself needs no reload', async ({ freshLearner }) => {
    await startGermanCourse(freshLearner, '10 min');

    const url = freshLearner.url();
    const levels = freshLearner.getByRole('group', { name: 'Level' });

    await expect(levels).toBeHidden();

    await freshLearner.getByRole('button', { name: 'I already know my level' }).click();
    await expect(levels).toBeVisible();

    // The picker replaces the offer, so "Back" is what returns to the routes.
    await freshLearner.getByRole('button', { name: 'Back' }).click();
    await expect(levels).toBeHidden();
    await expect(freshLearner.getByRole('link', { name: 'Take the placement test' })).toBeVisible();

    expect(freshLearner.url()).toBe(url);
  });

  /** The tile is the only thing that says what a CEFR code is worth. */
  test('picking a level explains what it means', async ({ freshLearner }) => {
    await startGermanCourse(freshLearner, '10 min');
    await freshLearner.getByRole('button', { name: 'I already know my level' }).click();

    await pick(freshLearner, 'Level', 'A1');
    await expect(
      freshLearner.getByText('You manage simple phrases. Your lessons will aim at level A2.'),
    ).toBeVisible();

    await pick(freshLearner, 'Level', 'C2');
    await expect(
      freshLearner.getByText(
        'You have mastered the language. Your lessons will maintain and refine it.',
      ),
    ).toBeVisible();
  });

  /** The case a boolean "has onboarded" flag on the user would get wrong. */
  test('a language already studied cannot be picked again', async ({ freshLearner }) => {
    await startGermanCourse(freshLearner, '60 min');
    await setLevel(freshLearner, 'B1');

    await freshLearner.goto('/en/onboarding');

    const languages = freshLearner.getByRole('group', { name: 'Language to learn' });
    await expect(languages.getByRole('radio', { name: 'Deutsch' })).toBeDisabled();
    await expect(languages.getByRole('radio', { name: 'English' })).toBeEnabled();
  });

  /** The form stays on screen and inert rather than disappearing. */
  test('every language studied leaves the form inert, with a way back', async ({
    freshLearner,
  }) => {
    for (const [language, level] of [
      ['Deutsch', 'B1'],
      ['Français', 'A2'],
      ['English', 'C1'],
    ]) {
      await startCourse(freshLearner, language, '30 min');
      await setLevel(freshLearner, level);
    }

    await freshLearner.goto('/en/onboarding');

    await expect(freshLearner.getByText('No new language to add for now.')).toBeVisible();
    await expect(freshLearner.getByRole('radio', { name: 'Deutsch' })).toBeDisabled();
    await expect(freshLearner.getByRole('radio', { name: '30 min' })).toBeDisabled();
    await expect(freshLearner.getByRole('button', { name: 'Next' })).toBeDisabled();
    await expect(
      freshLearner.getByRole('link', { name: 'Back to my English course' }),
    ).toBeVisible();
  });
});
