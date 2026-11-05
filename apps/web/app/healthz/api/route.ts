import { NextResponse } from 'next/server';

import { pingApi } from '@/lib/api';

/**
 * Whether the API answers, always as a 200: the tab socket asks this before
 * every retry while the API is down, and the browser logs any 5xx as a console
 * error. /healthz/upstream keeps its 503, which Prometheus and the blackbox
 * alert read.
 *
 * Like /healthz next door, this must never be answered from a build snapshot.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await pingApi({ baseUrl: process.env.API_INTERNAL_URL });
  return NextResponse.json({ api: result.status === 'ok' ? 'up' : 'down' });
}
