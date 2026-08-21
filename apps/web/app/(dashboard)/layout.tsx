import type { ReactNode } from 'react';
import Link from 'next/link';

import { SessionNav } from '@/components/session-nav';
import { LegalFooter } from '@/components/legal-footer';

/**
 * The app shell. `h-dvh` rather than (main)'s `min-h-dvh`: the pane below owns
 * the scrolling, so the shell is pinned to the viewport and the compact footer
 * stays in view.
 */

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex w-full max-w-6xl items-baseline justify-between gap-4 px-6 py-5">
          <Link href="/" className="text-base font-semibold tracking-tight text-slate-100">
            ft_transcendence
          </Link>
          <SessionNav />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pt-8 pb-4">{children}</main>

      <LegalFooter />
    </div>
  );
}
