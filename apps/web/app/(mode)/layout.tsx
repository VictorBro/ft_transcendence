import type { ReactNode } from 'react';
import Link from 'next/link';

import { LegalFooter } from '@/components/legal-footer';
import { SessionNav } from '@/components/session-nav';
import { Shell } from '@/components/shell';

/**
 * The practice shell: the same pinned frame as (dashboard), but the wordmark is
 * replaced by a close button, since a mode is something you leave rather than
 * navigate away from.
 */
export default function ModeLayout({ children }: { children: ReactNode }) {
  return (
    <Shell
      brand={
        <Link
          href="/dashboard"
          aria-label="Back to dashboard"
          className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
        >
          ✕
        </Link>
      }
      nav={<SessionNav />}
      fill
      footer={<LegalFooter />}
    >
      {children}
    </Shell>
  );
}
