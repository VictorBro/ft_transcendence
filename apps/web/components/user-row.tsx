import type { ReactNode } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import type { Language, PublicUser } from '@ft/shared';

import { Link } from '@/i18n/navigation';
import { Avatar } from './avatar';
import { PresenceDot } from './presence-dot';

/**
 * One person in a list: avatar and display name, linked to their profile, then
 * what can be done. The name keeps 8rem before the buttons wrap under it, so it
 * stays readable on a phone. A friend also gets an online dot on their avatar.
 */
export function UserRow({
  user,
  online,
  languages,
  children,
}: {
  user: PublicUser;
  /**
   * Whether this friend was online when the page was rendered. Only the friends
   * list passes it: search results and requests get no dot, since only a friend
   * may see when you are online.
   */
  online?: boolean;
  /** The languages they learn, as a line under the name. */
  languages?: Language[];
  children?: ReactNode;
}) {
  const t = useTranslations('Languages');
  const format = useFormatter();

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      {/* relative: the dot is pinned to the avatar's bottom right corner. */}
      <div className="relative shrink-0">
        <Avatar src={user.avatarUrl} name={user.displayName} size={40} />
        {online === undefined ? null : (
          <span className="absolute -right-0.5 -bottom-0.5 flex">
            {/* Keyed on the rendered value, so a refresh starts a fresh dot from it. */}
            <PresenceDot key={String(online)} userId={user.id} online={online} />
          </span>
        )}
      </div>
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
