import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@ft/shared';

import { fetchSession, type SessionResult } from './api';

/**
 * The session as the server sees it, reported verbatim: this collects the
 * cookies and the forwarded address and hands back whatever the API said,
 * without deciding what it means. Reading cookies() makes every caller a
 * dynamic route, which is required anyway: a page that renders someone's name
 * must never be served from a cache built for someone else.
 *
 * Callers interpret, because "unavailable" is harmless on a public page and
 * destructive on a protected one.
 */
export async function loadSession(): Promise<SessionResult> {
  const store = await cookies();
  const cookie = store
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ');

  // Passed through unchanged rather than appended to: the API trusts one proxy
  // hop and reads the left-most address, so adding this container's own would
  // put the wrong entry there. Caddy is the sole ingress and rewrites the
  // header, so what arrives here is the visitor's address.
  const forwardedFor = (await headers()).get('x-forwarded-for');

  return fetchSession({
    baseUrl: process.env.API_INTERNAL_URL,
    cookie,
    forwardedFor: forwardedFor ?? undefined,
  });
}

/**
 * For pages that render for everyone. Here a failed lookup may safely degrade
 * to the signed-out view: nothing is taken away from the visitor, the page just
 * shows less. This is the one place where collapsing the two failures is right.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const result = await loadSession();
  return result.status === 'ok' ? result.user : null;
}

/**
 * For pages that have nothing to show a signed-out visitor.
 *
 * Only a 401 redirects. An unavailable API throws instead, so Next renders the
 * error boundary and the session cookie survives: the visitor reloads and is
 * still signed in. Redirecting here would have logged out a signed-in user over
 * a rate-limit reply or a restart.
 */
export async function requireUser(): Promise<SessionUser> {
  const result = await loadSession();

  if (result.status === 'signed-out') {
    redirect('/login');
  }

  if (result.status === 'unavailable') {
    throw new Error(`Could not verify the session: ${result.reason}`);
  }
  return result.user;
}
