import type { ReactNode } from 'react';

import { DashboardNav } from '@/components/dashboard-nav';
import { LegalFooter } from '@/components/legal-footer';
import { Shell, Wordmark } from '@/components/shell';
import { TimeZoneSync } from '@/components/time-zone-sync';
import { loadSession } from '@/lib/session';

/** The course shell: pinned to the viewport from `lg`, where the pane below owns
 *  the scroll. Below it the panes stack and the page scrolls instead. */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // Only reads the session: the pages decide what a signed-out visitor gets.
  const session = await loadSession();

  return (
    <>
      {session.status === 'ok' ? <TimeZoneSync storedTimeZone={session.data.timeZone} /> : null}
      <Shell
        brand={<Wordmark href="/learn" />}
        nav={<DashboardNav />}
        fill
        footer={<LegalFooter />}
      >
        {children}
      </Shell>
    </>
  );
}
