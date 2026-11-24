import type { ReactNode } from 'react';

import { DashboardNav } from '@/components/dashboard-nav';
import { LegalFooter } from '@/components/legal-footer';
import { LocaleSync } from '@/components/locale-sync';
import { Shell, Wordmark } from '@/components/shell';
import { TimeZoneSync } from '@/components/time-zone-sync';
import { currentUser } from '@/lib/session';
import { COURSE_MENU_SLOT } from '@/lib/course-menu-slot';

/** The course shell: pinned to the viewport from `lg`, where the pane below owns
 *  the scroll. Below it the panes stack and the page scrolls instead. */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // Only reads the session: the pages decide what a signed-out visitor gets.
  const user = await currentUser();

  return (
    <>
      {user ? <TimeZoneSync storedTimeZone={user.timeZone} /> : null}
      {user ? <LocaleSync storedLocale={user.locale} /> : null}
      <Shell
        brand={
          <>
            <Wordmark href="/learn" />
            {/* The course page puts its My course button here, below lg. */}
            <div id={COURSE_MENU_SLOT} className="contents" />
          </>
        }
        nav={<DashboardNav />}
        fill
        footer={<LegalFooter />}
      >
        {children}
      </Shell>
    </>
  );
}
