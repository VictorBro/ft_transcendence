import { test as base, expect, type Page } from '@playwright/test';

import { expectFitsTheScreen } from '../support/layout';

const test = base.extend<{ phonePage: Page }>({
  phonePage: async ({ browser, browserName }, use) => {
    const context = await browser.newContext({
      viewport: { width: 360, height: 800 },
      isMobile: browserName !== 'firefox',
      hasTouch: true,
    });
    try {
      await use(await context.newPage());
    } finally {
      await context.close();
    }
  },
});

test('the layout gate waits for streamed viewport metadata to take effect', async ({
  phonePage,
  browserName,
}) => {
  await phonePage.setContent(`<!doctype html><html><head></head><body><p>Mobile content</p>
    <script>
      document.documentElement.dataset.initialWidth = document.documentElement.clientWidth;
      setTimeout(() => {
        const meta = document.createElement('meta');
        meta.name = 'viewport';
        meta.content = 'width=device-width, initial-scale=1';
        document.head.append(meta);
      }, 200);
    </script></body></html>`);
  if (browserName === 'webkit') {
    expect(await phonePage.locator('html').getAttribute('data-initial-width')).toBe('980');
  }
  await expectFitsTheScreen(phonePage, 'late viewport fixture');
});

test('the layout gate still rejects a page with no viewport metadata', async ({ phonePage }) => {
  await phonePage.setContent(
    '<!doctype html><html><head></head><body>Missing viewport</body></html>',
  );
  await expect(expectFitsTheScreen(phonePage, 'missing viewport fixture')).rejects.toThrow(
    /viewport/,
  );
});
