import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Sentence mode' };

export const dynamic = 'force-dynamic';

export default async function SentenceModePage() {
  await requireUser();

  return <ComingSoon title="Sentence mode" />;
}
