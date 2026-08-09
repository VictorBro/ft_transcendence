import type { Metadata } from 'next';

import { requireUser } from '@/lib/session';
import { TwoFactorPanel } from './two-factor-panel';

export const metadata: Metadata = { title: 'Two factor authentication' };

export const dynamic = 'force-dynamic';

export default async function TwoFactorPage() {
  // requireUser first: the panel below decides what to show from the status, and
  // a signed-out visitor should land on /login rather than on an empty page.
  await requireUser();

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Two factor authentication</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          An authenticator app generates a code that changes every 30 seconds. With it enabled, a
          stolen password alone will not sign anyone in.
        </p>
      </div>
      <TwoFactorPanel />
    </div>
  );
}
