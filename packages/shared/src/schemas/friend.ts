import { z } from 'zod';

import { PublicUserSchema } from './user';

/** Values match FriendshipStatus in apps/api/prisma/schema.prisma. */
export const FriendshipStatusSchema = z.enum(['pending', 'accepted']);
export type FriendshipStatus = z.infer<typeof FriendshipStatusSchema>;

/**
 * A friend, and whether they are online as the page is rendered; presence:update
 * keeps it current afterwards. Accepted friends only: a pending request does not
 * let anyone watch when you come and go.
 */
export const FriendSchema = PublicUserSchema.extend({ online: z.boolean() });
export type Friend = z.infer<typeof FriendSchema>;

/** Your side of every row you are in, each list newest first. */
export const FriendsSchema = z.object({
  friends: z.array(FriendSchema),
  received: z.array(PublicUserSchema),
  sent: z.array(PublicUserSchema),
});
export type Friends = z.infer<typeof FriendsSchema>;

/** Accepted when their request was already waiting: two requests that cross. */
export const FriendRequestResultSchema = z.object({ status: FriendshipStatusSchema });
export type FriendRequestResult = z.infer<typeof FriendRequestResultSchema>;

/**
 * How many friend requests wait on you: the account menu's count. Always the
 * whole picture, like DmUnread: `at` is taken before the count, so a tab keeps
 * the latest whatever order two arrive in. GET /api/friends/pending answers it
 * for the server render; friend:pending pushes it after that.
 */
export const FriendPendingSchema = z.object({
  count: z.number().int().nonnegative(),
  at: z.iso.datetime(),
});
export type FriendPending = z.infer<typeof FriendPendingSchema>;
