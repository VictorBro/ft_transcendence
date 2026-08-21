import type { ReactNode } from 'react';
import Link from 'next/link';

import { SessionNav } from '@/components/session-nav';
import { LegalFooter } from '@/components/legal-footer';

/**
 * The practice shell: same pinned `h-dvh` frame as (dashboard), but the logo is
 * replaced by a close button, since a mode is something you leave rather than
 * navigate away from.
 */

export default function ModeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex w-full max-w-6xl items-baseline justify-between gap-4 px-6 py-5">
          <Link
            href="/dashboard"
            aria-label="Back to dashboard"
            className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
          >
            ✕
          </Link>
          <SessionNav />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pt-8 pb-4">{children}</main>

      <LegalFooter />
    </div>
  );
}
