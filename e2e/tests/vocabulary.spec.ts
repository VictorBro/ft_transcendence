import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { formatViolations, watchConsole } from '../support/console-guard';
import { expectFitsTheScreen } from '../support/layout';
import {
  answerPage,
  contentLessons,
  lessonPlan,
  mainButton,
  pageIndex,
  playLesson,
} from '../support/lesson-play';
import { expect, placeCourse, test } from '../support/session';

/**
 * The vocabulary lesson (#147) on the French A1 lessons, played the way a
 * learner plays them (lesson-play.ts), in a browser with no voice: the
 * Listen buttons are not there and nothing needs them. The console guard
 * watches each play.
 */

const LANG = 'fr';
const LESSON = 'fr-classroom-objects';
const lessonPath = (lesson = LESSON) => `/en/learn/${LANG}/lessons/${lesson}`;
const plan = lessonPlan(LESSON, 'en');
interface Brief {
  targets: { wordClass: string; translations: Record<string, string[] | undefined> }[];
}
const readBrief = (id: string): Brief =>
  JSON.parse(
    readFileSync(path.resolve(__dirname, '..', '..', 'content', 'briefs', `${id}.json`), 'utf8'),
  ) as Brief;
const brief = readBrief(LESSON);

const firstWith = (type: string) =>
  plan.pages.findIndex((p) => p.items.some((item) => item.type === type));
const FIRST_CARDS = firstWith('vocabulary_flashcards');
const GENDERS = firstWith('vocabulary_gender_select');
const MATCHING = firstWith('vocabulary_matching');
const FIRST_GAP = firstWith('vocabulary_typed_gap');
const FIRST_EXAM = plan.pages.findIndex((p) => p.role === 'exam');
const PHONE = { width: 360, height: 800 };

/** A browser with no voice for any language: speechSynthesis lists none. */
async function noVoice(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if ('speechSynthesis' in window) {
      Object.defineProperty(window.speechSynthesis, 'getVoices', { value: () => [] });
    }
  });
}

/** Opens a lesson page and starts the lesson. */
async function start(page: Page, lesson = LESSON): Promise<void> {
  await page.goto(lessonPath(lesson));
  await page.getByRole('button', { name: 'Start the lesson' }).click();
  await page.waitForURL(/\/play$/);
}

test.describe('a vocabulary lesson', () => {
  // A play is some twenty pages, and each is a request.
  test.describe.configure({ timeout: 240_000 });

  test('plays from the lesson page to the results, on a phone with no voice', async ({
    freshLearner: learner,
  }) => {
    await learner.setViewportSize(PHONE);
    await noVoice(learner);
    const violations = watchConsole(learner);
    await placeCourse(learner, { lang: LANG, level: 'A1', dailyGoal: 10 });

    // The lesson page: its word count, and one section per word group.
    await learner.goto(lessonPath());
    await expect(learner.getByRole('heading', { level: 1, name: plan.title })).toBeVisible();
    await expect(learner.getByText(`${brief.targets.length} words`, { exact: true })).toBeVisible();
    await expectFitsTheScreen(learner, 'lesson page');
    await learner.getByRole('button', { name: 'Start the lesson' }).click();
    await learner.waitForURL(/\/play$/);

    // The introduction reads only.
    await expect(learner.getByRole('heading', { name: 'Read the introduction.' })).toBeVisible();
    await expectFitsTheScreen(learner, 'introduction');
    await playLesson(learner, plan, { stop: (index) => index === FIRST_CARDS });

    // B3: Continue waits for every card, and one turned card is not enough.
    const cards = learner.locator('[data-card]');
    const total = await cards.count();
    await expect(learner.getByText(`0 of ${total} cards turned`)).toBeVisible();
    await expect(learner.getByText('Flip every card to continue.')).toBeVisible();
    await expect(mainButton(learner)).toBeDisabled();
    const turn = cards.first().getByRole('button', { name: /^Turn the card/ });
    await turn.click();
    await expect(learner.getByText(`1 of ${total} cards turned`)).toBeVisible();
    await expect(cards.first()).toHaveAttribute('data-turned', 'true');
    await expect(mainButton(learner)).toBeDisabled();
    // Turned back, it still counts: it was seen.
    await turn.click();
    await expect(cards.first()).toHaveAttribute('data-turned', 'false');
    await expect(learner.getByText(`1 of ${total} cards turned`)).toBeVisible();
    await expectFitsTheScreen(learner, 'flashcards page');

    // B2: the matching board.
    await playLesson(learner, plan, { stop: (index) => index === MATCHING });
    await expectFitsTheScreen(learner, 'matching page');

    // B4 before its Check: the bare term, since the article would give the gender away.
    await playLesson(learner, plan, { stop: (index) => index === GENDERS });
    const rows = learner.locator('[data-unit]');
    const first = plan.pages[GENDERS]!.units[0]!;
    await expect(rows.first()).toContainText(first.prompt.learning!);
    await expect(rows.first()).not.toContainText(`${first.form}`);
    await expectFitsTheScreen(learner, 'gender page');

    // A typed gap answered wrong (a right one goes on with the green flash):
    // the word it wanted turns green among the four.
    await playLesson(learner, plan, { share: 0.75, stop: (index) => index === FIRST_GAP });
    const gap = plan.pages[FIRST_GAP]!;
    await answerPage(learner, gap, () => false);
    await mainButton(learner).click();
    await expect(
      learner.locator(`[data-page-index="${FIRST_GAP}"][data-state="checked"]`),
    ).toBeVisible();
    await expect(learner.locator('[data-reference="answer"]')).toHaveText(
      new RegExp(`^${gap.units[0]!.answer}`),
    );
    await expectFitsTheScreen(learner, 'typed gap, checked');
    await mainButton(learner).click();

    // The translation exam: every row has its article badge.
    await playLesson(learner, plan, { share: 0.75, stop: (index) => index === FIRST_EXAM });
    await expect(learner.locator('[data-article-badge]')).toHaveCount(
      plan.pages[FIRST_EXAM]!.units.length,
    );
    await expectFitsTheScreen(learner, 'exam page');

    // Without a voice, no Listen button anywhere.
    await expect(learner.locator('[data-listen]')).toHaveCount(0);
    await playLesson(learner, plan, { share: 0.75 });

    // The results: one row per answer, and the score.
    await expect(learner.getByRole('heading', { name: 'Your results' })).toBeVisible();
    await expect(learner.getByText(/^Score: \d+(\.\d)? \/ 100$/)).toBeVisible();
    await expect(learner.locator('[data-outcome]')).toHaveCount(
      plan.pages.filter((p) => p.role === 'practice' || p.role === 'exam').flatMap((p) => p.units)
        .length,
    );
    await expectFitsTheScreen(learner, 'results page');

    // The gender part: a wrong gender struck through, then the right one.
    await learner.getByRole('link', { name: /^Gender\b/ }).click();
    const part = learner.locator('.lesson-result-panel[data-selected="true"]');
    await expect(part.locator('[data-gender-row]')).toHaveCount(plan.pages[GENDERS]!.units.length);
    const wrong = part.locator('[data-gender-row]:has(del)').first();
    await expect(wrong.locator('del')).toHaveText(/^(Masculine|Feminine)$/);
    await expect(wrong.locator('strong')).toHaveText(/^(Masculine|Feminine)$/);
    expect(violations, formatViolations(violations)).toEqual([]);
  });

  test('B4 shows the form and the translation once checked', async ({ freshLearner: learner }) => {
    await noVoice(learner);
    await placeCourse(learner, { lang: LANG, level: 'A1', dailyGoal: 10 });
    await start(learner);
    await playLesson(learner, plan, { stop: (index) => index === GENDERS });

    const page = plan.pages[GENDERS]!;
    const unit = page.units[0]!;
    await learner.locator('[data-unit]').first().getByRole('radio', { name: 'Masculine' }).click();
    for (const [n, other] of page.units.entries()) {
      if (n === 0) continue;
      await learner
        .locator('[data-unit]')
        .nth(n)
        .getByRole('radio', { name: other.answer === 'masculine' ? 'Masculine' : 'Feminine' })
        .click();
    }
    await mainButton(learner).click();

    const row = learner.locator('[data-unit]').first();
    await expect(row).toContainText(unit.form!);
    await expect(row).toContainText(unit.translation!);
    const right = page.units.length - Number(unit.answer !== 'masculine');
    await expect(
      learner.getByText(`${right} of ${page.units.length} genders correct.`),
    ).toBeVisible();
  });

  test('the exam notes a missing article once, and asks the gender of a plural', async ({
    freshLearner: learner,
  }) => {
    await noVoice(learner);
    await placeCourse(learner, { lang: LANG, level: 'A1', dailyGoal: 10 });
    await start(learner);
    await playLesson(learner, plan, { stop: (index) => index === FIRST_EXAM });

    const exam = plan.pages[FIRST_EXAM]!;
    const [noun, other] = exam.units.filter(
      (u) => u.kind === 'text' && /^(un|une) /.test(u.answer),
    ) as Extract<(typeof exam.units)[number], { kind: 'text' }>[];
    const rowOf = (prompt: string) =>
      learner.locator('[data-unit]').filter({ has: learner.getByText(prompt, { exact: true }) });

    // The word alone: the badge turns red, and the first Next only shows the note.
    const row = rowOf(noun!.prompt.native!);
    await expect(row.getByText('with article', { exact: true })).toBeVisible();
    await row.getByRole('textbox').fill(noun!.answer.replace(/^(un|une) /, ''));
    await expect(row.locator('[data-article-badge="off"]')).toBeVisible();

    // A plural answer asks for its gender.
    const plural = rowOf(other!.prompt.native!);
    await plural.getByRole('textbox').fill('des zzz');
    await expect(plural.getByRole('radio', { name: 'Feminine' })).toBeVisible();
    await plural.getByRole('radio', { name: 'Feminine' }).click();
    await expect(plural.getByRole('radio', { name: 'Feminine' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await mainButton(learner).click();
    await expect(learner.getByText('Type the article before the word.')).toBeVisible();
    expect(await pageIndex(learner)).toBe(FIRST_EXAM);
    // The second press sends the page as it is.
    await mainButton(learner).click();
    await expect(learner.locator(`[data-page-index="${FIRST_EXAM + 1}"]`)).toBeVisible();
  });

  test('a nationality shows both its forms, and the exam says either is right', async ({
    freshLearner: learner,
  }) => {
    const lesson = 'fr-countries-and-nationalities';
    const nationalities = lessonPlan(lesson, 'en');
    // "Elle est ___": the gap wants the feminine, so its words show both forms.
    const feminine = nationalities.pages.findIndex((p) =>
      p.units.some((u) => u.kind === 'text' && u.answer === 'espagnole'),
    );
    // A nationality is taught as its pair (japonais, japonaise): either form is right.
    const pairs = new Set(
      readBrief(lesson)
        .targets.filter((t) => t.wordClass === 'adjective')
        .map((t) => t.translations.en?.[0]),
    );
    // The exam page that asks nationalities: the first one asks countries.
    const exam = nationalities.pages.findIndex(
      (p) => p.role === 'exam' && p.units.some((u) => pairs.has(u.prompt.native)),
    );
    await noVoice(learner);
    await placeCourse(learner, { lang: LANG, level: 'A1', dailyGoal: 10 });
    await start(learner, lesson);

    await playLesson(learner, nationalities, { stop: (index) => index === feminine });
    await expect(learner.getByText('espagnol, espagnole', { exact: true })).toBeVisible();

    await playLesson(learner, nationalities, { stop: (index) => index === exam });
    // Each row says so when either form is right, and only then.
    const asked = nationalities.pages[exam]!.units.map((u) => u.prompt.native!);
    for (const prompt of asked) {
      const row = learner
        .locator('[data-unit]')
        .filter({ has: learner.getByText(prompt, { exact: true }) });
      await expect(row.locator('[data-either-gender]')).toHaveCount(pairs.has(prompt) ? 1 : 0);
    }
  });

  // Every French A1 vocabulary lesson plays to its results in the browser.
  for (const lesson of contentLessons(LANG, 'A1', 'vocabulary').filter((id) => id !== LESSON)) {
    test(`${lesson} plays to its results`, async ({ freshLearner: learner }) => {
      await noVoice(learner);
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
