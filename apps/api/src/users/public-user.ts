import type { PublicUser } from '@ft/shared';

/** The columns another user may see, tied to PublicUserSchema's keys. */
export const PUBLIC_USER_SELECT = {
  id: true,
  displayName: true,
  avatarUrl: true,
} as const satisfies Record<keyof PublicUser, true>;
