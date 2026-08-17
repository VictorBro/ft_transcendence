import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Chat progress' };

export const dynamic = 'force-dynamic';

export default async function ChatProgressPage() {
  await requireUser();

  return <ComingSoon title="Chat progress" />;
}
