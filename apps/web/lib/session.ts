import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@ft/shared';

import { fetchSession } from './api';

/**
 * The session as the server sees it. Every caller is a dynamic route, because
 * a page that renders someone's name must never be served from a cache built
 * for someone else.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const cookie = store
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ');

  return fetchSession({ baseUrl: process.env.API_INTERNAL_URL, cookie });
}

/** For pages that have nothing to show a signed-out visitor. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (user === null) {
    redirect('/login');
  }
  return user;
}
