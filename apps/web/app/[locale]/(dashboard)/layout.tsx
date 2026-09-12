import type { ReactNode } from 'react';

import { HeaderNav } from '@/components/header-nav';
import { LegalFooter } from '@/components/legal-footer';
import { Shell, Wordmark } from '@/components/shell';

/** The app shell: pinned to the viewport, with the pane below owning the scroll. */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Shell brand={<Wordmark />} nav={<HeaderNav />} fill footer={<LegalFooter />}>
      {children}
    </Shell>
  );
}
