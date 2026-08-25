import { NextResponse } from 'next/server';

import { pingApi } from '@/lib/api';

/**
 * Reports the internal web -> api hop, which no page does: pages fold an
 * unreachable API into the signed-out view on purpose, so a wrong
 * API_INTERNAL_URL still renders a valid page and nothing fails.
 *
 * Deliberately not a session lookup. That would answer 503 for a caller who had
 * merely exhausted their own rate limit, reporting a healthy API as down.
 *
 * Like /healthz next door, this must never be answered from a build snapshot.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await pingApi({ baseUrl: process.env.API_INTERNAL_URL });

  if (result.status === 'unreachable') {
    return NextResponse.json(
      { status: 'unreachable', service: 'web', upstream: 'api', reason: result.reason },
      { status: 503 },
    );
  }

  return NextResponse.json({ status: 'ok', service: 'web', upstream: 'api' });
}
