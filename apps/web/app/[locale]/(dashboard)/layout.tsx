import type { ReactNode } from 'react';

import { DashboardNav } from '@/components/dashboard-nav';
import { LegalFooter } from '@/components/legal-footer';
import { Shell, Wordmark } from '@/components/shell';

/** The app shell: pinned to the viewport from `lg`, where the pane below owns
 *  the scroll. Below it the panes stack and the page scrolls instead. */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Shell
      brand={<Wordmark href="/dashboard" />}
      nav={<DashboardNav />}
      fill
      footer={<LegalFooter />}
    >
      {children}
    </Shell>
  );
}
