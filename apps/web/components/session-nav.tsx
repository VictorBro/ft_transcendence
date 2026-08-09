import Link from 'next/link';

import { currentUser } from '@/lib/session';
import { LogOutButton } from './log-out-button';

/**
 * Server component, so the first paint already knows who is signed in. Doing
 * this in the browser would flash the signed-out nav on every page load.
 */
export async function SessionNav() {
  const user = await currentUser();

  if (user === null) {
    return (
      <nav aria-label="Account" className="flex items-center gap-4 text-sm">
        <Link href="/login" className="underline underline-offset-4">
          Sign in
        </Link>
        <Link href="/signup" className="underline underline-offset-4">
          Create account
        </Link>
      </nav>
    );
  }

  return (
    <nav aria-label="Account" className="flex items-center gap-4 text-sm">
      <Link href="/profile" className="underline underline-offset-4">
        {user.displayName}
      </Link>
      <LogOutButton />
    </nav>
  );
}
