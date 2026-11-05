import { z } from 'zod';

import { PublicUserSchema } from './user';

/** Values match FriendshipStatus in apps/api/prisma/schema.prisma. */
export const FriendshipStatusSchema = z.enum(['pending', 'accepted']);
export type FriendshipStatus = z.infer<typeof FriendshipStatusSchema>;

/** Your side of every row you are in, each list newest first. */
export const FriendsSchema = z.object({
  friends: z.array(PublicUserSchema),
  received: z.array(PublicUserSchema),
  sent: z.array(PublicUserSchema),
});
export type Friends = z.infer<typeof FriendsSchema>;

/** Accepted when their request was already waiting: two requests that cross. */
export const FriendRequestResultSchema = z.object({ status: FriendshipStatusSchema });
export type FriendRequestResult = z.infer<typeof FriendRequestResultSchema>;
