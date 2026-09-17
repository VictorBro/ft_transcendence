import { redirect } from 'next/navigation';
import { cache } from 'react';
import type { SessionUser } from '@ft/shared';

import { fetchSession, fetchWithRequestHeaderAndIP, type SessionResult } from './api';

/**
 * Loads the validated session using the current request's cookies and visitor IP.
 *
 * @remarks Requires a Next.js server request context. React's cache memoizes
 * the result within a server render so the layout and page share the lookup.
 * The underlying fetch uses cache: 'no-store' to avoid persisting session
 * responses. No result is shared between visitors.
 *
 * Callers decide how to handle signed-out and unavailable results: a public
 * page may show less information, while a protected page must preserve errors.
 *
 * @returns The session user, signed-out, or unavailable without redirecting.
 */
export const loadSession = cache(async function loadSession(): Promise<SessionResult> {
  return fetchWithRequestHeaderAndIP(fetchSession);
});

/**
 * For pages that render for everyone. Here a failed lookup may safely degrade
 * to the signed-out view: nothing is taken away from the visitor, the page just
 * shows less. This is the one place where collapsing the two failures is right.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const result = await loadSession();
  return result.status === 'ok' ? result.data : null;
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
  return result.data;
}
