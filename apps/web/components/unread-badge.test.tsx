import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import de from '@/messages/de.json';
import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import { FriendPendingBadge, MenuBadge, UnreadBadge } from './unread-badge';

/**
 * renderToStaticMarkup is the server render: the tab's stores read as unheard
 * there, so what shows is what the header was rendered with. The unread total
 * is never known on the server.
 */
const CATALOGUES = { en, fr, de };

function render(node: ReactNode, locale: keyof typeof CATALOGUES = 'en'): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={CATALOGUES[locale]} timeZone="UTC">
      {node}
    </NextIntlClientProvider>,
  );
}

const digits = (text: string) => `<span aria-hidden="true">${text}</span>`;
const label = (text: string) => `<span class="sr-only">${text}</span>`;

describe('FriendPendingBadge', () => {
  it('shows the rendered count, and names it for a screen reader', () => {
    const html = render(<FriendPendingBadge rendered={2} />);

    expect(html).toContain(digits('2'));
    expect(html).toContain(label('2 friend requests'));
  });

  it.each([0, undefined])('shows nothing for %s', (rendered) => {
    expect(render(<FriendPendingBadge rendered={rendered} />)).toBe('');
  });

  it('caps the digits at 99+, and says the exact count', () => {
    const html = render(<FriendPendingBadge rendered={120} />);

    expect(html).toContain(digits('99+'));
    expect(html).toContain(label('120 friend requests'));
  });

  it.each([
    ['fr', '1 demande d&#x27;ami'],
    ['de', '1 Freundschaftsanfrage'],
  ] as const)('speaks %s', (locale, phrase) => {
    expect(render(<FriendPendingBadge rendered={1} />, locale)).toContain(label(phrase));
  });
});

describe('MenuBadge', () => {
  // Unread messages come from the socket only, so the server's total is the requests.
  it('shows the requests the header was rendered with', () => {
    const html = render(<MenuBadge requests={1} />);

    expect(html).toContain(digits('1'));
    expect(html).toContain(label('1 friend request'));
  });

  it.each([0, undefined])('shows nothing for %s requests and nothing unread heard', (requests) => {
    expect(render(<MenuBadge requests={requests} />)).toBe('');
  });
});

describe('UnreadBadge', () => {
  it('still names unread messages', () => {
    const html = render(<UnreadBadge count={1} />);

    expect(html).toContain(digits('1'));
    expect(html).toContain(label('1 unread message'));
  });
});
