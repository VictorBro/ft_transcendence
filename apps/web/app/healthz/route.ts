import { NextResponse } from 'next/server';

// Container HEALTHCHECK target. Deliberately not under /api: Caddy routes /api
// to the NestJS service, so a web route there would be unreachable in prod.
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ status: 'ok', service: 'web' });
}
