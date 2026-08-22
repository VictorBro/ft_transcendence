import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Word mode' };

export const dynamic = 'force-dynamic';

export default async function WordModePage() {
  await requireUser();

  return <ComingSoon title="Word mode" />;
}
