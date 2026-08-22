import type { ReactNode } from 'react';

import { SessionNav } from '@/components/session-nav';
import { Shell, Wordmark } from '@/components/shell';
import { SiteFooter } from '@/components/site-footer';

/**
 * The marketing and account shell. Not `fill`: these are documents that may run
 * past the viewport, and the full footer is meant to be scrolled to.
 */
export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <Shell brand={<Wordmark />} nav={<SessionNav />} footer={<SiteFooter />}>
      {children}
    </Shell>
  );
}
