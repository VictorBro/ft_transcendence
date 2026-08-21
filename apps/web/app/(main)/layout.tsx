import type { ReactNode } from 'react';
import Link from 'next/link';

import { SessionNav } from '@/components/session-nav';

const legalLinks = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Service' },
];

/**
 * The marketing shell. `min-h-dvh` rather than the app shells' `h-dvh`: these
 * pages are documents that may run past the viewport, and the full footer below
 * is meant to be scrolled to, not pinned.
 */

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex w-full max-w-6xl items-baseline justify-between gap-4 px-6 py-5">
          <Link href="/" className="text-base font-semibold tracking-tight text-slate-100">
            ft_transcendence
          </Link>
          <SessionNav />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">{children}</main>

      <footer className="border-t border-slate-800">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-6 text-sm text-slate-400">
          <p>An academic project. Not a commercial service.</p>
          <nav aria-label="Legal">
            <ul className="flex gap-6">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="underline underline-offset-4 hover:text-slate-100"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}
