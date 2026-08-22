import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Discuss with a friend' };

export const dynamic = 'force-dynamic';

export default async function FriendsPage() {
  await requireUser();

  return <ComingSoon title="Discuss with a friend" />;
}
