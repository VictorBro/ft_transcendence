import type { ReactNode } from 'react';

import { DashboardNav } from '@/components/dashboard-nav';
import { LegalFooter } from '@/components/legal-footer';
import { Shell, Wordmark } from '@/components/shell';

/** The course shell: pinned to the viewport, with the pane below owning the scroll. */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Shell brand={<Wordmark href="/learn" />} nav={<DashboardNav />} fill footer={<LegalFooter />}>
      {children}
    </Shell>
  );
}
