import type { ReactNode } from 'react';

import { HeaderNav } from '@/components/header-nav';
import { LegalFooter } from '@/components/legal-footer';
import { Shell, Wordmark } from '@/components/shell';

/**
 * The Messages shell: pinned to the viewport from `lg`, as (dashboard) is, so
 * the list and the thread scroll in their own panes. No course switcher: no
 * course is open here, and it would cost an API call on every render, which
 * a page that refreshes on friend events pays often.
 */
export default function MessagesLayout({ children }: { children: ReactNode }) {
  return (
    <Shell brand={<Wordmark href="/learn" />} nav={<HeaderNav />} fill footer={<LegalFooter />}>
      {children}
    </Shell>
  );
}
