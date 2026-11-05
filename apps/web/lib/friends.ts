/** Server half of the friends API, like courses.ts. */
import { redirect } from 'next/navigation';
import { FriendsSchema, UserSearchResultSchema, type Friends, type PublicUser } from '@ft/shared';

import { apiGet, type BaseResult } from './api';

/** requireUser for the friends page: this read answers the session question too. */
export async function requireFriends(): Promise<Friends> {
  return settle(await apiGet(FriendsSchema, '/api/friends'), 'friends');
}

/** Only called with a query UserSearchQuerySchema accepted, so a 400 never happens. */
export async function searchUsers(q: string): Promise<PublicUser[]> {
  return settle(await apiGet(UserSearchResultSchema, '/api/users', { q }), 'search results').users;
}

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

/** Where you stand with someone, read off your own lists: picks a search row's action. */
export function relationTo(lists: Friends, userId: string): Relation {
  const has = (users: PublicUser[]) => users.some((user) => user.id === userId);

  if (has(lists.friends)) return 'friend';
  if (has(lists.received)) return 'received';
  if (has(lists.sent)) return 'sent';
  return 'none';
}
