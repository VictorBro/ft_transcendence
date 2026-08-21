import { NextResponse } from 'next/server';

import { loadSession } from '@/lib/session';

// Reports the internal web -> api hop, which no page does: currentUser() folds
// "unavailable" into "signed-out" on purpose, so a wrong API_INTERNAL_URL still
// renders a valid signed-out page. Like /healthz next door, this must never be
// answered from a build-time snapshot.
export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await loadSession();

  if (result.status === 'unavailable') {
    return NextResponse.json(
      { status: 'unavailable', service: 'web', upstream: 'api', reason: result.reason },
      { status: 503 },
    );
  }

  return NextResponse.json({ status: 'ok', service: 'web', upstream: 'api' });
}
