import { requireUser } from '@/lib/session';
import { Metadata } from 'next';
import { GreetingSequence } from './greeting-sequence';

export const metadata: Metadata = { title: 'First Contact' };

export const dynamic = 'force-dynamic';

export default async function ChatPage() {
  await requireUser();

  return (
    <div className="text-center">
      <GreetingSequence />
    </div>
  );
}
