import { expect, test } from '@playwright/test';

/**
 * The i18n module (SUBJECT_SUMMARY.md: "i18n with ≥3 complete languages, language
 * switcher, all text translatable") is otherwise invisible to the rest of the
 * suite: every other spec is deliberately pinned to /en (see routes.ts). This is
 * the one place that proves the other two languages are real, the switcher
 * works, and a locale choice survives navigation rather than silently reverting
 * to English.
 */
test.describe('internationalisation', () => {
  // Two things that render outside the visible page, so no amount of looking at
  // the site proves either one.
  test.describe('the document declares its language', () => {
    // Nothing on screen changes with this attribute. It is what a screen reader
    // reads to pick its pronunciation, and what the browser reads for hyphenation
    // and spell-check, so lang="en" on a French page is wrong in a way only a
    // test or devtools can show.
    for (const locale of ['en', 'fr', 'de']) {
      test(`/${locale} sets lang="${locale}"`, async ({ page }) => {
        await page.goto(`/${locale}`);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
      });
    }

    // The tab title comes from generateMetadata, which the rest of the suite
    // never reads. "All text translatable" covers it: a title is text a reader
    // sees, and an untranslated one would label a French page in English.
    test('the tab title is translated', async ({ page }) => {
      await page.goto('/fr/privacy');
      await expect(page).toHaveTitle(/Politique de confidentialité/);

      await page.goto('/de/terms');
      await expect(page).toHaveTitle(/Nutzungsbedingungen/);
    });
  });

  // hasLocale() in [locale]/layout.tsx rejects anything the catalogue has no
  // file for. Without it the render continues with an unknown locale and
  // next-intl answers every key with its own path, which reads as a half-broken
  // page rather than as a missing one.
  test('an unsupported locale answers 404', async ({ page }) => {
    const response = await page.goto('/es/login');

    expect(response?.status()).toBe(404);
  });

  test.describe('content follows the locale', () => {
    test('the home page renders in French', async ({ page }) => {
      await page.goto('/fr');

      await expect(
        page.getByRole('heading', {
          level: 1,
          name: "Apprenez une langue avec un tuteur qui s'adapte à vous",
        }),
      ).toBeVisible();
      await expect(page.getByRole('link', { name: 'Se connecter' })).toBeVisible();
    });

    test('the home page renders in German', async ({ page }) => {
      await page.goto('/de');

      await expect(
        page.getByRole('heading', {
          level: 1,
          name: 'Lerne eine Sprache mit einem Tutor, der sich dir anpasst',
        }),
      ).toBeVisible();
      await expect(page.getByRole('link', { name: 'Anmelden' })).toBeVisible();
    });

    // Regression guard for the fallback in lib/legal-content/index.ts: before
    // fr.ts and de.ts existed, these routes rendered the English document under
    // a French or German URL, which reads as "translated" without being one.
    test('legal pages render translated content, not the English fallback', async ({ page }) => {
      await page.goto('/fr/privacy');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Politique de confidentialité',
      );
      await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText(
        "1. Champ d'application",
      );

      await page.goto('/de/terms');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nutzungsbedingungen');
      await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText('1. Annahme');
    });
  });

  test.describe('language switcher', () => {
    test('switching language updates both the URL prefix and the rendered content', async ({
      page,
    }) => {
      await page.goto('/en');
      await expect(page.getByRole('heading', { level: 1 })).toContainText(
        'Learn a language with a tutor',
      );

      await page.getByRole('link', { name: 'fr', exact: true }).click();

      await expect(page).toHaveURL('/fr');
      await expect(page.getByRole('heading', { level: 1 })).toContainText(
        "Apprenez une langue avec un tuteur qui s'adapte à vous",
      );
    });
  });

  test.describe('locale persistence', () => {
    test('visiting a prefixed route sets the NEXT_LOCALE cookie to match', async ({
      page,
      context,
    }) => {
      await page.goto('/de');

      const cookies = await context.cookies();
      const localeCookie = cookies.find((cookie) => cookie.name === 'NEXT_LOCALE');
      expect(localeCookie?.value).toBe('de');
    });

    // Proves the middleware redirect behind the app's plain-looking <Link>s:
    // once NEXT_LOCALE is set, a request for an unprefixed path lands in that
    // locale rather than falling back to the default (en). See proxy.ts.
    test('an unprefixed URL redirects to the locale remembered in the cookie', async ({ page }) => {
      await page.goto('/fr');

      const response = await page.request.get('/login', { maxRedirects: 0 });
      expect(response.status()).toBe(307);
      expect(response.headers().location).toBe('/fr/login');
    });

    // The client-side counterpart: internal navigation (footer, header) has to
    // stay in the current locale without ever bouncing through that redirect.
    test('client-side navigation stays in the current locale', async ({ page }) => {
      await page.goto('/fr');

      // The landmark is named from the catalogue too, so a French page exposes a
      // French name to a screen reader. Asserting the English one here would
      // mean the aria-label had been left behind as a literal.
      await page
        .getByRole('navigation', { name: 'Informations légales' })
        .getByRole('link', { name: 'Politique de confidentialité' })
        .click();

      await expect(page).toHaveURL('/fr/privacy');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Politique de confidentialité',
      );
    });
  });
});
