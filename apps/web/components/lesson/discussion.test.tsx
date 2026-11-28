import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import en from '@/messages/en.json';
import { Discussion } from './discussion';

/**
 * The discussion as the server draws it, before any message: no DOM and no
 * click here (the tests run in node), so the dots coming and going are
 * checked through isThinking (discussion-client.test.ts) and in e2e.
 */
describe('Discussion', () => {
  it('has its thinking region on the page before any message, empty, with no dots', () => {
    const out = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <Discussion
          lang="fr"
          id="fr-subject-pronouns"
          attemptId="6f1c2b8e-3d4a-4e5f-9a6b-7c8d9e0f1a2b"
          onStale={() => {}}
        />
      </NextIntlClientProvider>,
    );
    // Already there, so its text is announced when it comes.
    expect(out).toContain(
      '<p aria-live="polite" class="sr-only" data-slot="tutor-thinking-status"></p>',
    );
    expect(out).not.toContain('data-slot="tutor-thinking"');
    // The 429 countdown keeps the one status role (e2e: tutor.getByRole('status')).
    expect(out).not.toContain('role="status"');
  });
});
