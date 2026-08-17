import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Roleplay' };

export const dynamic = 'force-dynamic';

export default async function RoleplayPage() {
  await requireUser();

  return <ComingSoon title="Roleplay" />;
}
