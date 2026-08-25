import type { Page } from '@playwright/test';

import {
  AUTHENTICATED_FOOTER_ROUTES,
  LEGAL_MINIMUM_CHARACTERS,
  LEGAL_ROUTES,
  PUBLIC_FOOTER_ROUTES,
} from '../support/routes';
import { expect, test } from '../support/session';

/**
 * Rejection criterion: /privacy and /terms must exist and carry real content.
 * Checked twice on purpose. The request-level assertion catches a routing or
 * proxy regression, the rendered assertion catches a page that returns 200 with
 * an empty shell.
 */
test.describe('legal pages', () => {
  for (const route of LEGAL_ROUTES) {
    test(`${route.name} responds 200 with a real document`, async ({ request }) => {
      const response = await request.get(route.path);

      expect(response.status(), `${route.path} did not return 200`).toBe(200);
      expect(response.headers()['content-type']).toContain('text/html');

      const html = await response.text();
      expect(
        html.length,
        `${route.path} returned ${html.length} bytes of HTML, which is a placeholder`,
      ).toBeGreaterThan(LEGAL_MINIMUM_CHARACTERS);
    });

    test(`${route.name} renders at least ${LEGAL_MINIMUM_CHARACTERS} characters`, async ({
      page,
    }) => {
      await page.goto(route.path);

      const article = page.locator('article');
      await expect(article).toBeVisible();

      // innerText, not textContent: it reads what a human sees, so text hidden
      // by CSS cannot pad the count.
      const text = await article.innerText();
      expect(
        text.length,
        `${route.path} rendered ${text.length} characters, minimum is ${LEGAL_MINIMUM_CHARACTERS}`,
      ).toBeGreaterThanOrEqual(LEGAL_MINIMUM_CHARACTERS);

      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      // More than one section heading: a single-paragraph page is a placeholder.
      expect(await page.getByRole('heading', { level: 2 }).count()).toBeGreaterThan(1);
    });
  }

  /**
   * The claim the subject makes: both documents are one click away from
   * wherever the reader happens to be. Every shell labels that nav from the
   * same Footer.legalNav key, so the same assertion holds whichever footer
   * rendered. "Legal" is its English value, which is what this suite reads:
   * every route here is pinned to /en. i18n.spec.ts asserts the French one.
   *
   * The hrefs are locale-prefixed on purpose. Both footers use the Link from
   * @/i18n/navigation, so the href already carries the active locale and the
   * click costs no middleware redirect. A bare /privacy here would mean the app
   * had gone back to next/link and was relying on the NEXT_LOCALE cookie to
   * repair the URL.
   */
  const expectLegalLinks = async (page: Page) => {
    const legalNav = page.getByRole('navigation', { name: 'Legal' });
    await expect(legalNav.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/en/privacy',
    );
    await expect(legalNav.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
      'href',
      '/en/terms',
    );
  };

  for (const route of PUBLIC_FOOTER_ROUTES) {
    test(`both documents are reachable from the footer of ${route.name}`, async ({ page }) => {
      await page.goto(route.path);
      await expectLegalLinks(page);
    });
  }

  test.describe('behind a session', () => {
    for (const route of AUTHENTICATED_FOOTER_ROUTES) {
      test(`both documents are reachable from the footer of ${route.name}`, async ({
        signedIn: page,
      }) => {
        await page.goto(route.path);
        // Without this the guard bouncing us to /login would still find a
        // footer there and pass, which is the failure mode that let the
        // footerless shells ship in the first place.
        await expect(page).toHaveURL(new RegExp(`${route.path}$`));

        await expectLegalLinks(page);
      });
    }
  });
});
