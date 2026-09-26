import { expect, type Page } from '@playwright/test';

/**
 * The layout gate. "Frontend clear, responsive, accessible across devices" is a
 * mandatory technical requirement of the subject, and nothing in the suite
 * measured it: every spec ran at a desktop width, so three screens reached
 * `main` unusable on a phone with the gates green.
 *
 * What makes that possible is that overflow is silent. An element wider than
 * the screen does not clip and does not throw. The page still renders, every
 * locator still resolves, and a functional assertion cannot tell the
 * difference, while the reader is left scrolling sideways or unable to reach
 * the content at all. So this gate measures boxes rather than asking whether an
 * element is on screen.
 */

interface OverflowingPane {
  where: string;
  content: number;
  box: number;
}

export async function expectFitsTheScreen(page: Page, route: string): Promise<void> {
  const screen = page.viewportSize()?.width;
  expect(screen, 'this gate needs a viewport; the context was created without one').toBeDefined();

  const { layoutViewport, documentWidth, panes } = await page.evaluate(() => {
    const root = document.documentElement;

    /*
      Only boxes that scroll can hold content the document never sees. Anything
      else pushes its overflow up to the document, where documentWidth catches
      it. `hidden` is left out on purpose: it is how `truncate` shortens a long
      name, which is deliberate rather than a layout fault.
    */
    const panes: OverflowingPane[] = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((element) => {
        const { overflowX } = getComputedStyle(element);
        return (
          (overflowX === 'auto' || overflowX === 'scroll') &&
          element.scrollWidth > element.clientWidth + 1
        );
      })
      .map((element) => ({
        where: `${element.tagName.toLowerCase()}.${element.className}`.slice(0, 90),
        content: element.scrollWidth,
        box: element.clientWidth,
      }));

    return { layoutViewport: root.clientWidth, documentWidth: root.scrollWidth, panes };
  });

  /*
    Not a zoom test. With `width=device-width` the layout viewport stays the
    width of the device whatever the content does, so what this catches is that
    meta tag going missing: without it a phone lays the page out in a
    desktop-width viewport and scales the result down.
  */
  expect(
    layoutViewport,
    `${route} was laid out in a ${layoutViewport}px viewport on a ${screen}px screen, so it does not declare width=device-width`,
  ).toBe(screen);

  expect(
    documentWidth,
    `${route} occupies ${documentWidth}px inside a ${layoutViewport}px viewport, so it scrolls sideways`,
  ).toBeLessThanOrEqual(layoutViewport);

  /*
    `overflow-y-auto` also turns `overflow-x` into auto, so a pane can hold
    content wider than itself while the document stays exactly the width of the
    screen. Where the scrollbar is hidden too, as on the lobby and course
    columns, there is no way to reach that content at all.
  */
  expect(
    panes,
    `${route} keeps content inside panes narrower than it:\n${panes
      .map((pane) => `  ${pane.where}\n    ${pane.content}px of content in a ${pane.box}px box`)
      .join('\n')}\n`,
  ).toEqual([]);
}
