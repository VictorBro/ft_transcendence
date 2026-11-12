import type { Page } from '@playwright/test';

import {
  enrol,
  expect,
  finishBlank,
  ONBOARDED_COURSE,
  placeCourse,
  SECOND_COURSE,
  test,
} from '../support/session';

/**
 * The all lessons page (#87). What each view should show is read from
 * GET /api/courses/:lang/lessons with the same params, never from the seed,
 * so new content does not break the assertions.
 */

interface Card {
  id: string;
  title: string;
  summary: string;
  kind: string;
  ready: boolean;
}

interface LessonPage {
  levelTotal: number;
  total: number;
  page: number;
  pageSize: number;
  items: Card[];
}

const LANG = ONBOARDED_COURSE.lang;
const list = (params = '', locale = 'en', lang: string = LANG) =>
  `/${locale}/learn/${lang}/lessons${params}`;

const readPage = async (page: Page, params = '', lang: string = LANG): Promise<LessonPage> => {
  const response = await page.request.get(`/api/courses/${lang}/lessons${params}`);
  expect(response.status()).toBe(200);
  return response.json();
};

const rows = (page: Page) => page.locator('[data-lesson]');
const rowIds = (page: Page) =>
  rows(page).evaluateAll((items) => items.map((item) => item.getAttribute('data-lesson')));

/**
 * Holds the server's answer to each navigation of the page, prefetches aside,
 * so a test can act while a change is still on its way.
 */
const slowNavigations = (page: Page, ms: number) =>
  page.route(
    (url) => url.pathname.endsWith('/lessons'),
    async (route) => {
      const headers = route.request().headers();
      if (headers['rsc'] === '1' && !headers['next-router-prefetch']) {
        await new Promise((resolve) => setTimeout(resolve, ms));
      }
      await route.continue();
    },
  );

test.describe('the all lessons page', () => {
  test('a direct load renders exactly the view in its URL', async ({ freshLearner: page }) => {
    // Three grammar lessons failed one after the other, so the view has rows
    // and its sort and direction have an order to get right.
    await placeCourse(page, ONBOARDED_COURSE);
    const failed = (await readPage(page, '?kind=grammar')).items
      .filter((card) => card.ready)
      .slice(0, 3);
    expect(failed, 'three ready grammar lessons').toHaveLength(3);
    for (const card of failed) await finishBlank(page, LANG, card.id);
    const params = '?status=failed&kind=grammar&sort=finishedAt&dir=desc';
    const expected = await readPage(page, params);
    expect(expected.items.map((card) => card.id)).toEqual(failed.map((card) => card.id).reverse());

    await page.goto(list(params));

    await expect(page.getByRole('checkbox', { name: 'Not passed yet' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Grammar' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Passed', exact: true })).not.toBeChecked();
    await expect(page.getByRole('combobox', { name: 'Sort' })).toHaveValue('finishedAt');
    await expect(page.getByRole('combobox', { name: 'Direction' })).toHaveValue('desc');
    expect(await rowIds(page)).toEqual(expected.items.map((card) => card.id));
  });

  test('status=soon lists only Coming soon rows, and none is a link', async ({ onboarded }) => {
    const expected = await readPage(onboarded, '?status=soon');
    expect(expected.items.length).toBeGreaterThan(0);

    await onboarded.goto(list('?status=soon'));

    await expect(rows(onboarded)).toHaveCount(expected.items.length);
    for (const row of await rows(onboarded).all()) {
      await expect(row).toContainText('Coming soon');
      await expect(row.getByRole('link')).toHaveCount(0);
    }
  });

  test('pages of 20 over the whole level, with a working pager', async ({ onboarded }) => {
    const { levelTotal, pageSize } = await readPage(onboarded);
    const pages = Math.ceil(levelTotal / pageSize);
    expect(pages).toBeGreaterThan(1);

    await onboarded.goto(list());
    const pager = onboarded.getByRole('navigation', { name: 'Pages' });

    await expect(rows(onboarded)).toHaveCount(pageSize);
    await expect(pager.getByText(`1 to ${pageSize} of ${levelTotal}`)).toBeVisible();
    await expect(pager.getByRole('link', { name: `${pages}`, exact: true })).toBeVisible();

    await pager.getByRole('link', { name: 'Next' }).click();

    await expect(onboarded).toHaveURL(/\/lessons\?page=2$/);
    await expect(pager.locator('[aria-current="page"]')).toHaveText('2');
    await expect(
      pager.getByText(`${pageSize + 1} to ${Math.min(2 * pageSize, levelTotal)} of ${levelTotal}`),
    ).toBeVisible();
  });

  test('a ready row links to its lesson page', async ({ onboarded }) => {
    const ready = (await readPage(onboarded)).items.find((card) => card.ready);
    expect(ready, 'a ready lesson on page 1').toBeDefined();

    await onboarded.goto(list());

    await expect(
      onboarded.locator(`[data-lesson="${ready!.id}"]`).getByRole('link'),
    ).toHaveAttribute('href', `/en/learn/${LANG}/lessons/${ready!.id}`);
  });

  test('a hand-edited URL renders the default view', async ({ onboarded }) => {
    const expected = await readPage(onboarded);

    await onboarded.goto(list('?sort=foo&page=0'));

    await expect(onboarded.getByRole('combobox', { name: 'Sort' })).toHaveValue('position');
    expect(await rowIds(onboarded)).toEqual(expected.items.map((card) => card.id));
  });

  test('groups put a header wherever the group changes', async ({ onboarded }) => {
    const { items } = await readPage(onboarded, '?group=kind');
    const kinds = items.map((card) => card.kind).filter((kind, i, all) => all[i - 1] !== kind);
    const labels: Record<string, string> = {
      grammar: 'Grammar',
      vocabulary: 'Vocabulary',
      functions: 'Everyday phrases',
      reading: 'Reading',
    };

    await onboarded.goto(list('?group=kind'));

    await expect(onboarded.getByRole('heading', { level: 2 })).toHaveText(
      kinds.map((kind) => labels[kind]!),
    );
  });

  test('a box applies as soon as it is checked, and its chip takes it off', async ({
    onboarded,
  }) => {
    const expected = await readPage(onboarded, '?kind=grammar');

    await onboarded.goto(list());
    await onboarded.getByRole('checkbox', { name: 'Grammar' }).check();

    await expect(onboarded).toHaveURL(/\/lessons\?kind=grammar$/);
    await expect.poll(() => rowIds(onboarded)).toEqual(expected.items.map((card) => card.id));

    await onboarded.getByRole('link', { name: 'Remove Grammar' }).click();

    await expect(onboarded).toHaveURL(/\/lessons$/);
    await expect(onboarded.getByRole('checkbox', { name: 'Grammar' })).not.toBeChecked();
  });

  test('a chip back to a view the form sent earlier still unticks its box', async ({
    onboarded,
  }) => {
    await onboarded.goto(list());
    await onboarded.getByRole('checkbox', { name: 'Grammar' }).check();
    await expect(onboarded).toHaveURL(/\/lessons\?kind=grammar$/);
    await onboarded.getByRole('checkbox', { name: 'Vocabulary' }).check();
    await expect(onboarded).toHaveURL(/\/lessons\?kind=grammar%2Cvocabulary$/);

    // Back to ?kind=grammar, which the form itself sent a moment ago.
    await onboarded.getByRole('link', { name: 'Remove Vocabulary' }).click();

    await expect(onboarded).toHaveURL(/\/lessons\?kind=grammar$/);
    await expect(onboarded.getByRole('checkbox', { name: 'Vocabulary' })).not.toBeChecked();
    // The next change sends the form as it is: the removed filter stays off.
    await onboarded.getByRole('checkbox', { name: 'Reading' }).check();
    await expect(onboarded).toHaveURL(/\/lessons\?kind=grammar%2Creading$/);
  });

  test('a chip back to a view the form sent but never showed still unticks its box', async ({
    onboarded,
  }) => {
    await onboarded.goto(list());
    await slowNavigations(onboarded, 400);
    // Vocabulary goes out before Grammar lands: Next drops the Grammar push.
    await onboarded.getByRole('checkbox', { name: 'Grammar' }).check();
    await onboarded.waitForTimeout(100);
    await onboarded.getByRole('checkbox', { name: 'Vocabulary' }).check();
    await expect(onboarded).toHaveURL(/\/lessons\?kind=grammar%2Cvocabulary$/);

    await onboarded.getByRole('link', { name: 'Remove Vocabulary' }).click();

    await expect(onboarded).toHaveURL(/\/lessons\?kind=grammar$/);
    await expect(onboarded.getByRole('checkbox', { name: 'Vocabulary' })).not.toBeChecked();
    await onboarded.getByRole('checkbox', { name: 'Reading' }).check();
    await expect(onboarded).toHaveURL(/\/lessons\?kind=grammar%2Creading$/);
  });

  test('Back while a change is on its way puts the boxes back on the view', async ({
    onboarded,
  }) => {
    // On a phone, Back is how the sheet is often closed.
    await onboarded.setViewportSize({ width: 390, height: 844 });
    await onboarded.goto(list());
    await onboarded.getByRole('link', { name: 'Filters' }).click();
    await slowNavigations(onboarded, 1_500);
    const grammar = onboarded.getByRole('checkbox', { name: 'Grammar' });
    await grammar.check();

    // Back drops the Grammar push, onto the same unfiltered view.
    await onboarded.goBack();

    await expect(onboarded).toHaveURL(/\/lessons$/);
    await onboarded.getByRole('link', { name: 'Filters' }).click();
    await expect(grammar).not.toBeChecked();
    await onboarded.getByRole('checkbox', { name: 'Reading' }).check();
    await expect(onboarded).toHaveURL(/\/lessons\?kind=reading#filters$/);
  });

  test('Back onto the view shown keeps what the form applied to it', async ({ onboarded }) => {
    await onboarded.setViewportSize({ width: 390, height: 844 });
    await onboarded.goto(list());
    await onboarded.getByRole('link', { name: 'Filters' }).click();
    await onboarded.getByRole('checkbox', { name: 'Grammar' }).check();
    await expect(onboarded).toHaveURL(/\/lessons\?kind=grammar#filters$/);
    await onboarded.getByRole('combobox', { name: 'Sort' }).selectOption('score');
    await expect(onboarded).toHaveURL(/\/lessons\?kind=grammar&sort=score#filters$/);
    await onboarded.getByRole('link', { name: 'Close' }).click();

    // Back puts the fields on the view shown: the one the form itself applied.
    await onboarded.goBack();

    await expect(onboarded.locator('#filters')).toBeVisible();
    await expect(onboarded.getByRole('checkbox', { name: 'Grammar' })).toBeChecked();
    await expect(onboarded.getByRole('combobox', { name: 'Sort' })).toHaveValue('score');
  });

  test('Back undoes one change, not all of them', async ({ onboarded }) => {
    await onboarded.goto(list());
    await onboarded.getByRole('checkbox', { name: 'Grammar' }).check();
    await expect(onboarded).toHaveURL(/\/lessons\?kind=grammar$/);
    await onboarded.getByRole('checkbox', { name: 'Passed', exact: true }).check();
    await expect(onboarded).toHaveURL(/\/lessons\?status=done&kind=grammar$/);

    await onboarded.goBack();

    await expect(onboarded).toHaveURL(/\/lessons\?kind=grammar$/);
    await expect(onboarded.getByRole('checkbox', { name: 'Grammar' })).toBeChecked();
    await expect(
      onboarded.getByRole('checkbox', { name: 'Passed', exact: true }),
    ).not.toBeChecked();
  });

  test('a link taken while a search waits keeps the view it opened', async ({ onboarded }) => {
    await onboarded.clock.install();
    await onboarded.goto(list());
    const pager = onboarded.getByRole('navigation', { name: 'Pages' });
    await expect(pager).toBeVisible();
    // Time stops, so the search typed now waits until the link has landed.
    await onboarded.clock.pauseAt((await onboarded.evaluate(() => Date.now())) + 1_000);
    await onboarded.getByRole('searchbox', { name: 'Search' }).fill('nombres');
    await pager.getByRole('link', { name: 'Next' }).click();
    await expect(onboarded).toHaveURL(/\/lessons\?page=2$/);

    // The waiting search would have sent the reset form, which has no page.
    await onboarded.clock.runFor(1_000);
    await onboarded.waitForLoadState('networkidle');

    await expect(onboarded).toHaveURL(/\/lessons\?page=2$/);
  });

  test('a fold stays open when its last box is unticked', async ({ onboarded }) => {
    await onboarded.goto(list());
    await onboarded.locator('summary', { hasText: 'Topics' }).click();
    const box = onboarded.getByRole('group', { name: 'Topics' }).getByRole('checkbox').first();

    await box.check();
    await expect(onboarded).toHaveURL(/\/lessons\?topic=/);
    await box.uncheck();
    await expect(onboarded).toHaveURL(/\/lessons$/);

    await expect(box).toBeVisible();
  });

  test('Next at the bottom of a page opens the next one at its top', async ({ onboarded }) => {
    await onboarded.setViewportSize({ width: 1280, height: 800 });
    await onboarded.goto(list());
    // From lg the pane scrolls, not the window.
    await onboarded
      .locator('[data-scroll-pane]')
      .evaluate((pane) => pane.scrollTo({ top: pane.scrollHeight }));

    await onboarded
      .getByRole('navigation', { name: 'Pages' })
      .getByRole('link', { name: 'Next' })
      .click();

    await expect(onboarded).toHaveURL(/\/lessons\?page=2$/);
    await expect(rows(onboarded).first()).toBeInViewport();
  });

  test('a select keeps the focus when it changes the list', async ({ onboarded }) => {
    await onboarded.goto(list());
    const sort = onboarded.getByRole('combobox', { name: 'Sort' });
    await sort.focus();
    await sort.selectOption('score');

    await expect(onboarded).toHaveURL(/\/lessons\?sort=score$/);
    await expect(sort).toBeFocused();
  });

  test('Clear filters puts the selects back on the default view', async ({ onboarded }) => {
    // Loaded on sort=score, so the select was mounted with score as its default.
    await onboarded.goto(list('?kind=grammar&sort=score&group=kind'));

    await onboarded.getByRole('link', { name: 'Clear filters' }).click();

    await expect(onboarded).toHaveURL(/\/lessons$/);
    await expect(onboarded.getByRole('combobox', { name: 'Sort' })).toHaveValue('position');
    await expect(onboarded.getByRole('combobox', { name: 'Group' })).toHaveValue('none');
  });

  test('a search applies once the typing stops', async ({ onboarded }) => {
    await onboarded.goto(list());
    await onboarded.getByRole('searchbox', { name: 'Search' }).fill('nombres');

    await expect(onboarded).toHaveURL(/\/lessons\?q=nombres$/);
    await expect(onboarded.getByRole('link', { name: 'Remove “nombres”' })).toBeVisible();
  });

  test('a search typed before the page hydrates still applies', async ({ onboarded }) => {
    // Next's scripts are held, so the box is typed in while the page is plain
    // HTML: on a fast browser the race this covers would otherwise rarely happen.
    // Scripts only: the stylesheet shares the folder, and holding it holds the paint.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await onboarded.route(/\/_next\/static\/.*\.js$/, async (route) => {
      await held;
      await route.continue();
    });

    await onboarded.goto(list(), { waitUntil: 'domcontentloaded' });
    await onboarded.getByRole('searchbox', { name: 'Search' }).fill('nombres');
    release();

    await expect(onboarded).toHaveURL(/\/lessons\?q=nombres$/);
    await expect(onboarded.getByRole('searchbox', { name: 'Search' })).toHaveValue('nombres');
  });

  test('on a phone, the filters open as a sheet and close again', async ({ onboarded }) => {
    await onboarded.setViewportSize({ width: 390, height: 844 });
    await onboarded.goto(list());
    const grammar = onboarded.getByRole('checkbox', { name: 'Grammar' });

    await expect(grammar).toBeHidden();
    await onboarded.getByRole('link', { name: 'Filters' }).click();
    await expect(grammar).toBeVisible();
    await onboarded.getByRole('button', { name: 'Show the lessons' }).click();
    await expect(grammar).toBeHidden();
  });

  test('on a phone, Back onto the open sheet shows its view', async ({ onboarded }) => {
    await onboarded.setViewportSize({ width: 390, height: 844 });
    await onboarded.goto(list());
    const sheet = onboarded.locator('#filters');
    const grammar = onboarded.getByRole('checkbox', { name: 'Grammar' });
    await onboarded.getByRole('link', { name: 'Filters' }).click();
    await grammar.check();
    await expect(onboarded).toHaveURL(/\/lessons\?kind=grammar#filters$/);
    await onboarded.getByRole('checkbox', { name: 'Passed', exact: true }).check();
    await expect(onboarded).toHaveURL(/\/lessons\?status=done&kind=grammar#filters$/);

    await onboarded.goBack();
    await onboarded.goBack();

    // The entry the Filters link made: the sheet open over the unfiltered list.
    await expect(onboarded).toHaveURL(/\/lessons#filters$/);
    await expect(sheet).toBeVisible();
    await expect(grammar).not.toBeChecked();
    await expect(onboarded.getByRole('link', { name: 'Remove Grammar' })).toBeHidden();
    await onboarded.goBack();
    await expect(sheet).toBeHidden();
    await onboarded.goForward();
    await expect(sheet).toBeVisible();
  });

  test('on a phone, Back onto the closed sheet shows its view', async ({ onboarded }) => {
    await onboarded.setViewportSize({ width: 390, height: 844 });
    await onboarded.goto(list());
    await onboarded.getByRole('link', { name: 'Filters' }).click();
    await onboarded.getByRole('checkbox', { name: 'Grammar' }).check();
    await expect(onboarded).toHaveURL(/\/lessons\?kind=grammar#filters$/);
    await onboarded.getByRole('button', { name: 'Show the lessons' }).click();
    await onboarded.getByRole('link', { name: 'Remove Grammar' }).click();
    await expect(onboarded).toHaveURL(/\/lessons$/);

    await onboarded.goBack();

    // The entry Show the lessons made: the sheet closed over the Grammar list.
    await expect(onboarded).toHaveURL(/\/lessons\?kind=grammar#?$/);
    await expect(onboarded.getByRole('link', { name: 'Remove Grammar' })).toBeVisible();
    await expect(onboarded.locator('#filters')).toBeHidden();
  });

  test('on a phone, Show the lessons while a change is on its way closes the sheet', async ({
    onboarded,
  }) => {
    await onboarded.setViewportSize({ width: 390, height: 844 });
    await onboarded.goto(list());
    await onboarded.getByRole('link', { name: 'Filters' }).click();
    await slowNavigations(onboarded, 800);
    await onboarded.getByRole('checkbox', { name: 'Grammar' }).check();

    await onboarded.getByRole('button', { name: 'Show the lessons' }).click();

    // The change was sent from the open sheet: landing, it must not reopen it.
    await expect(onboarded).toHaveURL(/\/lessons\?kind=grammar$/);
    await expect(onboarded.getByRole('link', { name: 'Remove Grammar' })).toBeVisible();
    await onboarded.reload();
    await expect(onboarded.locator('#filters')).toBeHidden();
  });

  test('without JavaScript, the phone sheet applies its boxes', async ({ browser, onboarded }) => {
    const context = await browser.newContext({
      storageState: await onboarded.context().storageState(),
      javaScriptEnabled: false,
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    const grammar = page.getByRole('checkbox', { name: 'Grammar' });

    await page.goto(list());
    await page.getByRole('link', { name: 'Filters' }).click();
    await grammar.check();
    await page.getByRole('button', { name: 'Show the lessons' }).click();

    await expect(page).toHaveURL(/kind=grammar/);
    await expect(grammar).toBeHidden();
    await context.close();
  });

  test('without JavaScript, the form still filters and the pager still pages', async ({
    browser,
    onboarded,
  }) => {
    const context = await browser.newContext({
      storageState: await onboarded.context().storageState(),
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    const expected = await readPage(page, '?kind=grammar&sort=position&dir=desc');

    await page.goto(list());
    await page.getByRole('checkbox', { name: 'Grammar' }).check();
    await page.getByRole('combobox', { name: 'Direction' }).selectOption('desc');
    await page.getByRole('button', { name: 'Apply' }).click();

    await expect(page).toHaveURL(/kind=grammar/);
    await expect(page).toHaveURL(/dir=desc/);
    expect(await rowIds(page)).toEqual(expected.items.map((card) => card.id));

    if (expected.total > expected.pageSize) {
      await page
        .getByRole('navigation', { name: 'Pages' })
        .getByRole('link', { name: '2' })
        .click();
      await expect(page).toHaveURL(/page=2/);
      await expect(page).toHaveURL(/kind=grammar/);
    }
    await context.close();
  });

  test('a search without accents finds a title with them, in every interface language', async ({
    onboarded,
  }) => {
    // The first accented title of the level, wherever it is.
    let accented: Card | undefined;
    for (let n = 1; accented === undefined; n += 1) {
      const { items, total, pageSize } = await readPage(onboarded, `?page=${n}`);
      accented = items.find((card) => card.title.normalize('NFD') !== card.title);
      if (n * pageSize >= total) break;
    }
    expect(accented, 'a French title with an accent').toBeDefined();
    const bare = accented!.title.normalize('NFD').replace(/\p{M}/gu, '');

    for (const locale of ['en', 'fr', 'de']) {
      await onboarded.goto(list(`?q=${encodeURIComponent(bare)}`, locale));
      await expect(onboarded.locator(`[data-lesson="${accented!.id}"]`)).toBeVisible();
    }
  });

  test('a German word typed with ae, oe or ue finds its ä, ö or ü, in every interface language', async ({
    onboarded,
  }) => {
    const lang = SECOND_COURSE.lang;
    await placeCourse(onboarded, SECOND_COURSE);
    // The first word of the level with an umlaut, wherever it is, as maedchen for Mädchen.
    let found: { card: Card; word: string } | undefined;
    for (let n = 1; found === undefined; n += 1) {
      const { items, total, pageSize } = await readPage(onboarded, `?page=${n}`, lang);
      for (const card of items) {
        const word = `${card.title} ${card.summary}`.match(/\p{L}*[äöü]\p{L}*/iu)?.[0];
        if (word !== undefined && found === undefined) found = { card, word };
      }
      if (n * pageSize >= total) break;
    }
    expect(found, 'a German word with ä, ö or ü').toBeDefined();
    const typed = found!.word
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue');
    const params = `?q=${encodeURIComponent(typed)}`;
    const expected = await readPage(onboarded, params, lang);

    for (const locale of ['en', 'fr', 'de']) {
      await onboarded.goto(list(params, locale, lang));
      await expect(onboarded.locator(`[data-lesson="${found!.card.id}"]`)).toBeVisible();
      expect(await rowIds(onboarded)).toEqual(expected.items.map((card) => card.id));
    }
  });

  test.describe('who can open it', () => {
    test('a signed out visitor is sent to the login page', async ({ page }) => {
      await page.goto(list());
      await expect(page).toHaveURL(/\/login$/);
    });

    test('a language the learner does not study opens onboarding with it picked', async ({
      onboarded,
    }) => {
      await onboarded.goto(list('', 'en', 'en'));
      await expect(onboarded).toHaveURL(/\/en\/onboarding\?lang=en$/);
    });

    test('a course with no level opens its own level step', async ({ freshLearner }) => {
      await enrol(freshLearner, 'de', 30);
      await freshLearner.goto(list('', 'en', 'de'));
      await expect(freshLearner).toHaveURL(/\/en\/onboarding\?lang=de$/);
    });

    test('an unlearnable language is a 404, not onboarding', async ({ onboarded }) => {
      const response = await onboarded.goto(list('', 'en', 'zz'));
      expect(response?.status()).toBe(404);
    });
  });
});
