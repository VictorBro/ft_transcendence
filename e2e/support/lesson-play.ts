import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import {
  expect,
  type APIRequestContext,
  type APIResponse,
  type Locator,
  type Page,
} from '@playwright/test';
import { lessons, type Locale } from '@ft/shared';

/**
 * Plays lessons the way a learner does (#146). The browser never gets the
 * keys, so the answers come from the lesson itself: the plan is built here,
 * in Node, from content/ with buildPlan, as the API builds it, and each
 * prompt on screen is matched to its plan unit by text. No database read,
 * no test route.
 *
 * Grammar (#146), vocabulary (#147) and functions (#149) play in the
 * browser; #148 teaches it reading. The API player below already answers every kind,
 * since it reads the page views as JSON.
 */

type LessonPlan = lessons.player.LessonPlan;
type PlanPage = lessons.player.PlanPage;
type PlanUnit = lessons.player.PlanUnit;
type UnitView = lessons.player.UnitView;
type AttemptView = lessons.player.AttemptView;
type Answer = lessons.player.Answer;

const CONTENT = path.resolve(__dirname, '..', '..', 'content');

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));

/**
 * The ids of the lessons in content/ of one language, level and kind
 * that have their lesson file (a vocabulary lesson is built from its
 * brief), sorted: a new one is played without anyone adding it to a list.
 */
export function contentLessons(lang: string, level: string, kind: string): string[] {
  return readdirSync(path.join(CONTENT, 'briefs'))
    .filter((file) => file.endsWith('.json'))
    .map((file) => readJson(path.join(CONTENT, 'briefs', file)) as Record<string, unknown>)
    .filter((brief) => brief.lang === lang && brief.level === level && brief.kind === kind)
    .map((brief) => String(brief.id))
    .filter(
      (id) => kind === 'vocabulary' || existsSync(path.join(CONTENT, 'lessons', `${id}.json`)),
    )
    .sort();
}

/** The plan of a lesson as the API builds it for an attempt in `locale`. */
export function lessonPlan(id: string, locale: Locale = 'en'): LessonPlan {
  const brief = readJson(path.join(CONTENT, 'briefs', `${id}.json`));
  let content: unknown = null;
  try {
    content = readJson(path.join(CONTENT, 'lessons', `${id}.json`));
  } catch {
    // A vocabulary lesson has no content file: the plan builds it from the brief.
  }
  return lessons.player.buildPlan({ brief, content } as lessons.player.LessonSource, locale);
}

/**
 * Which units to answer right: `share` of them, spread evenly over the
 * lesson in page order (0.5 is every other unit, 1 all, 0 none).
 */
export function rightShare(share: number): (n: number) => boolean {
  return (n) => Math.floor((n + 1) * share) > Math.floor(n * share);
}

/** The text of an option or token of a plan unit. */
const textOf = (list: { id: string; text: string }[], id: string) =>
  list.find((x) => x.id === id)?.text ?? '';

/** The English label of an option the interface words: a gender ("masculine" is Masculine). */
const shown = (list: { id: string; text: string; lang?: string }[], id: string) => {
  const option = list.find((x) => x.id === id);
  const text = option?.text ?? '';
  return option?.lang === 'ui' ? text.charAt(0).toUpperCase() + text.slice(1) : text;
};

/** The item types whose choices sit on the B2 board. */
const BOARDS = new Set([
  'grammar_person_matching',
  'grammar_pronoun_form_match',
  'vocabulary_matching',
  'function_matching',
]);

/** A typed answer that is right: the teaching answer. */
const rightText = (unit: Extract<PlanUnit, { kind: 'text' }>) => unit.answer;
/** One no lesson accepts. */
const WRONG_TEXT = 'zzz';

/* ------------------------------------------------------- in the browser */

/** The page of the player on screen, by its index. */
export async function pageIndex(page: Page): Promise<number> {
  const value = await page.locator('[data-page-index]').getAttribute('data-page-index');
  return Number(value);
}

/** The player's main button: Check, Continue, Start the exam, Next or Finish the exam. */
export function mainButton(page: Page): Locator {
  return page.getByRole('button', {
    name: /^(Check|Continue|Start the exam|Next|Finish the exam)$/,
  });
}

/**
 * The unit rows of the page on screen: around a gap, the ones whose text
 * holds the words before and after it; else the ones that show the prompt
 * exactly (il is not ils).
 */
function rowsOf(page: Page, prompt: PlanUnit['prompt']): Locator {
  const rows = page.locator('[data-unit]');
  const { before, after, learning, native } = prompt;
  if (before || after) {
    let found = rows;
    for (const text of [before, after]) if (text) found = found.filter({ hasText: text });
    return found;
  }
  const exact = learning ?? native;
  return exact ? rows.filter({ has: page.getByText(exact, { exact: true }) }) : rows;
}

/**
 * The row of a unit: by its prompt, else the first one not taken (a
 * functions line shows its text without the "Marc: " of the prompt).
 */
async function rowFor(page: Page, prompt: PlanUnit['prompt'], used: Set<string>): Promise<Locator> {
  const rows = rowsOf(page, prompt);
  return unusedRow((await rows.count()) > 0 ? rows : page.locator('[data-unit]'), used);
}

/**
 * The first of `rows` no earlier unit of the page took, marked as taken:
 * two units can show the same prompt, or the same text around a gap.
 */
async function unusedRow(rows: Locator, used: Set<string>): Promise<Locator> {
  for (let n = 0; n < (await rows.count()); n += 1) {
    const id = (await rows.nth(n).getAttribute('data-unit')) ?? '';
    if (!used.has(id)) {
      used.add(id);
      return rows.nth(n);
    }
  }
  return rows.first();
}

/** A word-order or spot row: the one whose word buttons are exactly `tokens`, in any order. */
async function tokenRow(page: Page, tokens: string[], used: Set<string>): Promise<Locator> {
  const rows = page.locator('[data-unit]');
  const want = [...tokens].sort().join('\u0000');
  for (let n = 0; n < (await rows.count()); n += 1) {
    const row = rows.nth(n);
    const id = (await row.getAttribute('data-unit')) ?? '';
    if (used.has(id)) continue;
    const words = await row.locator('button').allInnerTexts();
    if (
      [...words]
        .map((w) => w.trim())
        .sort()
        .join('\u0000') === want
    ) {
      used.add(id);
      return row;
    }
  }
  throw new Error(`No row with the words ${tokens.join(' ')}`);
}

/** Presses Next line until the dialogue on screen shows its last line. */
export async function unrollDialogue(page: Page): Promise<void> {
  const button = page.locator('.lesson-task-footer').getByRole('button');
  const status = page.locator('[data-hold-message]');
  if ((await page.locator('.lesson-dialogue').count()) === 0) return;
  // Before hydration the button still says Continue: wait for the line count beside it.
  await status.waitFor({ timeout: 5_000 }).catch(() => undefined);
  for (let n = 0; n < 50 && (await button.innerText()) === 'Next line'; n += 1) {
    const before = await status.innerText();
    await button.click();
    // One line more: the count beside the button moves on, or goes with the last line.
    await expect(status.filter({ hasText: before })).toHaveCount(0);
  }
}

/**
 * Answers every unit of the page on screen, right or wrong as `right`
 * says, through the controls a learner uses.
 */
export async function answerPage(
  page: Page,
  planPage: PlanPage,
  right: (unit: PlanUnit) => boolean,
): Promise<void> {
  const used = new Set<string>();
  // A board's options are used once each: the persons given so far.
  const given = new Set<string>();

  // Flashcards (B3): every card turned once before Continue.
  for (const turn of await page.getByRole('button', { name: /^Turn the card: / }).all()) {
    await turn.click();
  }
  // A dialogue (#149) unrolls with Next line, the main button until its last line.
  await unrollDialogue(page);
  // The listening reply: Show the text writes out the line and the replies.
  for (const show of await page
    .getByRole('button', { name: 'Show the text', pressed: false })
    .all()) {
    await show.click();
  }

  for (const unit of planPage.units) {
    const good = right(unit);
    switch (unit.kind) {
      case 'text': {
        const row = await rowFor(page, unit.prompt, used);
        await row.getByRole('textbox').fill(good ? rightText(unit) : WRONG_TEXT);
        // A "des ..." answer asks for its gender (a plurale tantum).
        if (good && unit.noun?.pluraleTantum && /^des\s/iu.test(rightText(unit))) {
          const gender = unit.noun.genders[0]!;
          await row
            .getByRole('radio', { name: gender.charAt(0).toUpperCase() + gender.slice(1) })
            .click();
        }
        break;
      }
      case 'choice': {
        const board = BOARDS.has(unit.itemType);
        const pickFrom = good
          ? unit.correct
          : unit.options.map((o) => o.id).filter((id) => !unit.correct.includes(id));
        if (board) {
          const option = pickFrom.find((id) => !given.has(id)) ?? pickFrom[0]!;
          given.add(option);
          // Two boxes can show the same form: the first one not given yet.
          const row = await rowFor(page, unit.prompt, used);
          await page
            .locator('[data-option]')
            .getByText(textOf(unit.options, option), { exact: true })
            .click();
          // The box is the row's last button: a Listen button can come before it.
          await row.getByRole('button').last().click();
        } else {
          const row = await rowFor(page, unit.prompt, used);
          await row
            .getByRole('radio', { name: shown(unit.options, pickFrom[0]!), exact: true })
            .click();
        }
        break;
      }
      case 'order': {
        const row = await tokenRow(
          page,
          unit.tokens.map((t) => t.text),
          used,
        );
        const order = unit.acceptedOrders[0]!.map((id) => textOf(unit.tokens, id));
        // Wrong: the right words, back to front.
        for (const word of good ? order : [...order].reverse()) {
          await row
            .getByRole('group')
            .getByRole('button', { name: word, exact: true })
            .first()
            .click();
        }
        break;
      }
      case 'spot': {
        const row = await tokenRow(
          page,
          unit.tokens.map((t) => t.text),
          used,
        );
        const faulty = unit.tokens.findIndex((t) => t.id === unit.faultyTokenId);
        const pickAt = good ? faulty : faulty === 0 ? 1 : 0;
        await row.getByRole('radio').nth(pickAt).click();
        const fix = unit.correction.accepted.answers[0]!;
        if (unit.correction.mode === 'select') {
          await row
            .getByRole('combobox')
            .selectOption(good ? fix : (unit.correction.choices.find((c) => c !== fix) ?? ''));
        } else {
          await row.getByRole('textbox').fill(good ? fix : WRONG_TEXT);
        }
        break;
      }
    }
  }
}

/**
 * Sends the page on screen with the main button and waits for the next
 * one: past the feedback of a practice page (its Continue, or the green
 * flash), or on to the results.
 */
export async function sendPage(page: Page): Promise<void> {
  const before = await pageIndex(page);
  const role = await page.locator('[data-page-index]').getAttribute('data-page-role');
  const moved = page.locator(`[data-page-index]:not([data-page-index="${before}"])`);
  const results = page.getByRole('heading', { name: 'Your results' });
  // A refused post leaves the page where it is, with the reason above the button.
  const refused = page.locator(`[data-page-index="${before}"]`).getByRole('alert');
  // The translation exam's first Next only shows its article notes; the second one sends.
  const nudge = page
    .locator(`[data-page-index="${before}"]`)
    .getByText('Type the article before the word.');

  // Already showing (a test pressed Next once): this press sends.
  const nudged = await nudge.first().isVisible();

  await mainButton(page).click();
  if (role === 'exam' && !nudged) {
    await settle(moved.or(results).or(refused).or(nudge.first()), refused, before);
    if (await nudge.first().isVisible()) await mainButton(page).click();
  }
  if (role === 'practice') {
    // Checked: the feedback and Continue, or the green flash that goes on by itself.
    const checked = page.locator(`[data-page-index="${before}"][data-state="checked"]`);
    await settle(moved.or(checked).or(refused), refused, before);
    if (await checked.isVisible()) await mainButton(page).click();
  }
  await settle(moved.or(results).or(refused), refused, before);
}

/** Waits for one of `any`, and fails with the player's words when it refused the page. */
async function settle(any: Locator, refused: Locator, index: number): Promise<void> {
  await expect(any.first()).toBeVisible({ timeout: 30_000 });
  if (await refused.isVisible()) {
    throw new Error(`The player refused page ${index}: ${await refused.innerText()}`);
  }
}

/**
 * Plays the lesson open in the player from the page on screen, each unit
 * right or wrong as `right` says, until `stop` (a page index) or the
 * results.
 */
export async function playLesson(
  page: Page,
  plan: LessonPlan,
  { share = 1, stop }: { share?: number; stop?: (index: number) => boolean } = {},
): Promise<void> {
  const isRight = rightShare(share);
  const order = new Map(plan.pages.flatMap((p) => p.units).map((u, n) => [u.id, n]));
  for (;;) {
    if (/\/results$/.test(new URL(page.url()).pathname)) return;
    const index = await pageIndex(page);
    if (stop?.(index)) return;
    await answerPage(page, plan.pages[index]!, (unit) => isRight(order.get(unit.id) ?? 0));
    await sendPage(page);
    // The last page replaces the player with the results.
    if (index === plan.pages.length - 1) {
      await page.waitForURL(/\/results$/);
      return;
    }
  }
}

/* ---------------------------------------------------- through the API */

/** The plan unit a unit view stands for: same prompt, and the same words for an order or a spot. */
function planUnitOf(planPage: PlanPage, view: UnitView, taken: Set<string>): PlanUnit {
  const same = (unit: PlanUnit) => {
    if (taken.has(unit.id) || unit.kind !== view.kind) return false;
    const keys = ['learning', 'native', 'before', 'after'] as const;
    if (keys.some((k) => unit.prompt[k] !== view.prompt[k])) return false;
    if ((view.kind === 'order' || view.kind === 'spot') && 'tokens' in unit) {
      const a = unit.tokens.map((t) => t.text).sort();
      const b = view.tokens.map((t) => t.text).sort();
      return a.join('\u0000') === b.join('\u0000');
    }
    return true;
  };
  const unit = planPage.units.find(same);
  if (!unit)
    throw new Error(`No plan unit on page ${planPage.index} for ${JSON.stringify(view.prompt)}`);
  taken.add(unit.id);
  return unit;
}

/** The answer of one unit, with the refs of its view. */
function answerOf(unit: PlanUnit, view: UnitView, good: boolean): Answer | undefined {
  if (!good) return undefined;
  if (unit.kind === 'text') {
    const gender = unit.noun?.pluraleTantum ? unit.noun.genders[0] : undefined;
    return gender ? { text: unit.answer, gender } : { text: unit.answer };
  }
  if (unit.kind === 'choice' && view.kind === 'choice') {
    const text = textOf(unit.options, unit.correct[0]!);
    const option = view.options.find((o) => o.text === text);
    return option ? { option: option.ref } : undefined;
  }
  if (unit.kind === 'order' && view.kind === 'order') {
    const left = [...view.tokens];
    const tokens = unit.acceptedOrders[0]!.map((id) => {
      const n = left.findIndex((t) => t.text === textOf(unit.tokens, id));
      return left.splice(n, 1)[0]!.ref;
    });
    return { tokens };
  }
  if (unit.kind === 'spot' && view.kind === 'spot') {
    const n = unit.tokens.findIndex((t) => t.id === unit.faultyTokenId);
    return { token: view.tokens[n]!.ref, text: unit.correction.accepted.answers[0]! };
  }
  return undefined;
}

/** How often postPatiently waits out a 429 before it gives up. */
const MAX_RATE_LIMIT_WAITS = 3;

/**
 * A POST that waits out the rate limit: the API allows 100 requests a
 * minute per learner, and a level of lessons is several hundred pages.
 * A 429 waits for the Retry-After it names, then sends again.
 */
async function postPatiently(
  request: APIRequestContext,
  url: string,
  data: unknown,
): Promise<APIResponse> {
  // A window or two of the limit; more means the limit is not what it should be.
  for (let waits = 0; ; waits += 1) {
    const response = await request.post(url, { data });
    if (response.status() !== 429) return response;
    if (waits === MAX_RATE_LIMIT_WAITS) {
      throw new Error(`${url}: still 429 after ${waits} waits for the rate limit`);
    }
    const seconds = Number(response.headers()['retry-after'] ?? '5');
    await new Promise((resolve) =>
      setTimeout(resolve, (Number.isFinite(seconds) ? seconds : 5) * 1000),
    );
  }
}

/**
 * Plays a whole lesson through its attempt routes, any kind: starts (or
 * retakes) it, then answers `share` of the units right on every page.
 * Returns the finished attempt.
 */
export async function finishThroughApi(
  request: APIRequestContext,
  lang: string,
  id: string,
  { share = 1, locale = 'en' as Locale } = {},
): Promise<AttemptView> {
  const url = `/api/courses/${lang}/lessons/${id}/attempt`;
  const plan = lessonPlan(id, locale);
  const isRight = rightShare(share);
  const started = await postPatiently(request, url, { locale });
  expect([200, 201]).toContain(started.status());
  let attempt = (await started.json()) as AttemptView;
  let n = 0;
  while (attempt.current !== null) {
    const view = attempt.current;
    const planPage = plan.pages[view.index]!;
    const taken = new Set<string>();
    const answers: Record<string, Answer> = {};
    for (const item of view.items) {
      for (const unit of 'units' in item ? item.units : []) {
        const answer = answerOf(planUnitOf(planPage, unit, taken), unit, isRight(n));
        n += 1;
        if (answer) answers[unit.ref] = answer;
      }
    }
    const response = await postPatiently(request, `${url}/pages/${view.index}`, {
      attemptId: attempt.attemptId,
      answers,
    });
    expect(response.status()).toBe(200);
    attempt = ((await response.json()) as { attempt: AttemptView }).attempt;
  }
  return attempt;
}
