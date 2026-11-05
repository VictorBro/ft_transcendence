/** Browser half of the friends API, like courses-client.ts. Every call names the other user. */
import { FriendRequestResultSchema, type FriendRequestResult } from '@ft/shared';
import { z } from 'zod';

import { clientDelete, clientPost, type ApiResult } from '@/lib/api-client';

const EmptyResponseSchema = z.void();

export function sendFriendRequest(userId: string): Promise<ApiResult<FriendRequestResult>> {
  return clientPost(FriendRequestResultSchema, `/api/friends/requests/${userId}`);
}

export function acceptFriendRequest(userId: string): Promise<ApiResult<void>> {
  return clientPost(EmptyResponseSchema, `/api/friends/requests/${userId}/accept`);
}

/** Declines theirs or cancels yours: there is at most one request between two people. */
export function deleteFriendRequest(userId: string): Promise<ApiResult<void>> {
  return clientDelete(EmptyResponseSchema, `/api/friends/requests/${userId}`);
}

export function removeFriend(userId: string): Promise<ApiResult<void>> {
  return clientDelete(EmptyResponseSchema, `/api/friends/${userId}`);
}
