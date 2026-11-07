import type { ReactNode } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import type { Language, PublicUser } from '@ft/shared';

import { Link } from '@/i18n/navigation';
import { Avatar } from './avatar';

/**
 * One person in a list: avatar and display name, linked to their profile, then
 * what can be done. The name keeps 8rem before the buttons wrap under it, so it
 * stays readable on a phone. #157 adds the online dot.
 */
export function UserRow({
  user,
  languages,
  children,
}: {
  user: PublicUser;
  /** The languages they learn, as a line under the name. */
  languages?: Language[];
  children?: ReactNode;
}) {
  const t = useTranslations('Languages');
  const format = useFormatter();

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <Avatar src={user.avatarUrl} name={user.displayName} size={40} />
      <div className="flex min-w-0 flex-[1_1_8rem] flex-col">
        {/* No prefetch: a list of people would cost a render each against the rate limit. */}
        <Link
          href={`/users/${user.id}`}
          prefetch={false}
          className="max-w-full self-start truncate underline underline-offset-4"
        >
          {user.displayName}
        </Link>
        {languages !== undefined && languages.length > 0 ? (
          <p className="truncate text-sm text-slate-400">
            {format.list(languages.map((lang) => t(lang)))}
          </p>
        ) : null}
      </div>
      {children}
    </li>
  );
}
