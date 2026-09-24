import { expect, type Page } from '@playwright/test';

/**
 * The layout gate. "Frontend clear, responsive, accessible across devices" is a
 * mandatory technical requirement of the subject, and nothing in the suite
 * measured it: every spec ran at a desktop width, so three screens reached
 * `main` unusable on a phone with the gates green.
 *
 * What makes that possible is that overflow is silent. An element wider than
 * the screen does not clip and does not throw. The page still renders, every
 * locator still resolves, and a functional assertion cannot tell the difference
 * — while the reader is left scrolling sideways, or reading a page the browser
 * shrank to fit. So this gate measures the document instead of asking whether
 * an element is on screen.
 */

/**
 * Two numbers, because the browser has two ways to answer content it cannot
 * fit.
 *
 * `clientWidth` is the layout viewport: the width the page believes it has. It
 * must stay the width of the device. A browser that cannot fit the content may
 * widen it instead and scale the whole page down, which is why a broken screen
 * reads as "everything is tiny" rather than as a scrollbar.
 *
 * `scrollWidth` is what the document actually occupies. Wider than the viewport
 * means the reader has to scroll sideways to see the rest of it.
 */
export async function expectFitsTheScreen(page: Page, route: string): Promise<void> {
  const screen = page.viewportSize()?.width;
  expect(screen, 'this gate needs a viewport; the context was created without one').toBeDefined();

  const { layoutViewport, documentWidth } = await page.evaluate(() => ({
    layoutViewport: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));

  expect(
    layoutViewport,
    `${route} rendered into a ${layoutViewport}px viewport on a ${screen}px screen, so the browser zoomed the page out to fit it`,
  ).toBe(screen);

  expect(
    documentWidth,
    `${route} occupies ${documentWidth}px inside a ${layoutViewport}px viewport, so it scrolls sideways`,
  ).toBeLessThanOrEqual(layoutViewport);
}
