import type { ReactNode } from 'react';

import { HeaderNav } from '@/components/header-nav';
import { LegalFooter } from '@/components/legal-footer';
import { Shell, Wordmark } from '@/components/shell';

/**
 * The marketing and account shell. Not `fill`: these are documents that may run
 * past the viewport, and the full footer is meant to be scrolled to.
 */
export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <Shell brand={<Wordmark />} nav={<HeaderNav />} footer={<LegalFooter />}>
      {children}
    </Shell>
  );
}
