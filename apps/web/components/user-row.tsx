import type { ReactNode } from 'react';
import type { PublicUser } from '@ft/shared';

import { Avatar } from './avatar';

/**
 * One person in a list: avatar and display name, then what can be done. The
 * name keeps 8rem before the buttons wrap under it, so it stays readable on a
 * phone. #156 links it to /users/[id], #157 adds the online dot.
 */
export function UserRow({ user, children }: { user: PublicUser; children?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <Avatar src={user.avatarUrl} name={user.displayName} size={40} />
      <span className="min-w-0 flex-[1_1_8rem] truncate">{user.displayName}</span>
      {children}
    </li>
  );
}
