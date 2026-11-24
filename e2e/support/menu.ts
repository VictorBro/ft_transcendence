import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * The signed-in header folds its switchers and account links behind one
 * button, on every screen. Opens it, unless it already is. Following a link or
 * switching course closes it again.
 *
 * Retried: the button is server-rendered, so a click that lands before
 * hydration does nothing.
 *
 * @param name - The button's name in the page's language: Menu, or Menü.
 */
export async function openMenu(page: Page, name = 'Menu'): Promise<void> {
  const button = page.getByRole('button', { name: new RegExp(`^${name}`) });
  await expect(async () => {
    if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true', { timeout: 1_000 });
  }).toPass();
}
