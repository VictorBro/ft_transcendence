import { HeaderMenu } from './header-menu';
import { LanguageSwitcher } from './language-switcher';
import { SessionNav } from './session-nav';
import { friendPending } from '@/lib/friends';
import { currentUser } from '@/lib/session';

/**
 * The right of the header, the same in every shell. Passed to Shell as a
 * prop rather than rendered inside it, because SessionNav reads cookies and
 * Shell also serves error.tsx, a client component that cannot.
 *
 * Signed in, it folds into HeaderMenu. A visitor's three items fit one row,
 * and folding them would hide Sign in.
 */
export async function HeaderNav() {
  const user = await currentUser();
  const items = (
    <>
      <LanguageSwitcher />
      <SessionNav />
    </>
  );

  if (user === null) {
    return <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">{items}</div>;
  }
  // Signed in only, so a visitor costs no extra call.
  return <HeaderMenu requests={await friendPending()}>{items}</HeaderMenu>;
}
