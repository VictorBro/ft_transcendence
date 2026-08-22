import type { ReactNode } from 'react';

import { LegalFooter } from '@/components/legal-footer';
import { SessionNav } from '@/components/session-nav';
import { Shell, Wordmark } from '@/components/shell';

/** The app shell: pinned to the viewport, with the pane below owning the scroll. */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Shell brand={<Wordmark />} nav={<SessionNav />} fill footer={<LegalFooter />}>
      {children}
    </Shell>
  );
}
