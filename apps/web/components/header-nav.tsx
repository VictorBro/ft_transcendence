import { LanguageSwitcher } from './language-switcher';
import { SessionNav } from './session-nav';

/**
 * The right of the header, the same in all three shells. Passed to Shell as a
 * prop rather than rendered inside it, because SessionNav reads cookies and
 * Shell also serves error.tsx and the 404, which must not.
 */
export function HeaderNav() {
  return (
    <div className="flex items-center gap-4">
      <LanguageSwitcher />
      <SessionNav />
    </div>
  );
}
