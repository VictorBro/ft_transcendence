import type { ReactNode } from 'react';

import { HeaderNav } from '@/components/header-nav';
import { LegalFooter } from '@/components/legal-footer';
import { Shell, Wordmark } from '@/components/shell';
import { currentUser } from '@/lib/session';

/**
 * The marketing and account shell. Not `fill`: these are documents that may run
 * past the viewport, so the footer sits after the content rather than pinned.
 *
 * The wordmark follows the session, as in the other shells: a signed-in user
 * goes back to the app, a visitor to the marketing page. HeaderNav already
 * reads the session, and loadSession is cached per render, so this adds no
 * lookup and makes no page dynamic that was not already.
 */
export default async function MainLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();

  return (
    <Shell
      brand={<Wordmark href={user === null ? '/' : '/learn'} />}
      nav={<HeaderNav />}
      footer={<LegalFooter />}
    >
      {children}
    </Shell>
  );
}
