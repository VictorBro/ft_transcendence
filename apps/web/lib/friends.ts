/** Server half of the friends API, like courses.ts. */
import { redirect } from 'next/navigation';
import { cache } from 'react';
import {
  FriendsSchema,
  PublicProfileSchema,
  RecentlyActiveSchema,
  SERVER_EVENTS,
  UserSearchResultSchema,
  type Friends,
  type PublicProfile,
  type PublicUser,
  type RecentlyActiveUser,
} from '@ft/shared';

import { apiFind, apiGet, type BaseResult, type FindResult } from './api';

// Any change between two people re-renders both their pages: the lists, the
// buttons and Recently active.
export const FRIEND_EVENTS = [
  SERVER_EVENTS.FRIEND_REQUEST,
  SERVER_EVENTS.FRIEND_ACCEPTED,
  SERVER_EVENTS.FRIEND_REMOVED,
] as const;

/** requireUser for the friends page: this read answers the session question too. */
export async function requireFriends(): Promise<Friends> {
  return settle(await apiGet(FriendsSchema, '/api/friends'), 'friends');
}

/** Only called with a query UserSearchQuerySchema accepted, so a 400 never happens. */
export async function searchUsers(q: string): Promise<PublicUser[]> {
  return settle(await apiGet(UserSearchResultSchema, '/api/users', { q }), 'search results').users;
}

/** People to add, newest first: the API leaves out everyone you have a row with. */
export async function recentlyActive(): Promise<RecentlyActiveUser[]> {
  return settle(await apiGet(RecentlyActiveSchema, '/api/users/recently-active'), 'recently active')
    .users;
}

/** Memoised per request: the title and the page both ask. Only called with a valid id. */
export const loadProfile = cache(async function loadProfile(
  id: string,
): Promise<FindResult<PublicProfile>> {
  return apiFind(PublicProfileSchema, `/api/users/${id}`);
});

function settle<T>(result: BaseResult<T>, what: string): T {
  if (result.status === 'signed-out') {
    redirect('/login');
  }

  // Thrown, since a redirect would read as a logout.
  if (result.status === 'unavailable') {
    throw new Error(`Could not load the ${what}: ${result.reason}`);
  }
  return result.data;
}

export type Relation = 'none' | 'sent' | 'received' | 'friend';

/**
 * Where you stand with someone, read off your own lists: picks a search row's
 * or a profile's action.
 */
export function relationTo(lists: Friends, userId: string): Relation {
  const has = (users: PublicUser[]) => users.some((user) => user.id === userId);

  if (has(lists.friends)) return 'friend';
  if (has(lists.received)) return 'received';
  if (has(lists.sent)) return 'sent';
  return 'none';
}
