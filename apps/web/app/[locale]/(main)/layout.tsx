import type { ReactNode } from 'react';

import { HeaderNav } from '@/components/header-nav';
import { LegalFooter } from '@/components/legal-footer';
import { Shell, Wordmark } from '@/components/shell';

/**
 * The marketing and account shell. Not `fill`: these are documents that may run
 * past the viewport, so the footer sits after the content rather than pinned.
 */
export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <Shell brand={<Wordmark />} nav={<HeaderNav />} footer={<LegalFooter />}>
      {children}
    </Shell>
  );
}
