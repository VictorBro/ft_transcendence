import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { UserSearchQuerySchema } from '@ft/shared';

import { FriendButton, RemoveFriendButton, RequestButtons } from '@/components/friend-buttons';
import { RefreshOn } from '@/components/refresh-on';
import { UserRow } from '@/components/user-row';
import {
  FRIEND_EVENTS,
  recentlyActive,
  relationTo,
  requireFriends,
  searchUsers,
  type Relation,
} from '@/lib/friends';
import { FriendSearch } from './friend-search';

// One key feeds this title, the heading and the link in the account menu.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('FriendsPage');

  return { title: t('title') };
}

// Renders one specific person's friends, so it must never be prerendered or cached.
export const dynamic = 'force-dynamic';

export default async function FriendsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  // A hand-edited ?q= is ignored rather than an error; the form checks what is
  // typed. Empty means no search, since a valid query has 3 characters at least.
  const search = UserSearchQuerySchema.safeParse({ q: (await searchParams).q });
  const query = search.success ? search.data.q : '';
  const [lists, found, recent] = await Promise.all([
    requireFriends(),
    query === '' ? null : searchUsers(query),
    recentlyActive(),
  ]);
  const t = await getTranslations('FriendsPage');

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-10">
      <section className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        {/* Keyed, so the field follows the URL, e.g. after the menu's Friends link. */}
        <FriendSearch key={query} query={query} />
        {found === null ? null : found.length === 0 ? (
          <p className="text-sm text-slate-400">{t('noResults', { query })}</p>
        ) : (
          <ul aria-label={t('results')} className="divide-y divide-slate-800">
            {found.map((user) => (
              <UserRow key={user.id} user={user}>
                <SearchAction relation={relationTo(lists, user.id)} userId={user.id} />
              </UserRow>
            ))}
          </ul>
        )}
      </section>

      {lists.received.length > 0 ? (
        <ListSection id="friends-received" title={t('received')}>
          {lists.received.map((user) => (
            <UserRow key={user.id} user={user}>
              <RequestButtons userId={user.id} />
            </UserRow>
          ))}
        </ListSection>
      ) : null}

      {lists.sent.length > 0 ? (
        <ListSection id="friends-sent" title={t('sent')}>
          {lists.sent.map((user) => (
            <UserRow key={user.id} user={user}>
              <FriendButton action="cancelRequest" userId={user.id} />
            </UserRow>
          ))}
        </ListSection>
      ) : null}

      <ListSection id="friends-list" title={t('yourFriends')} empty={t('noFriends')}>
        {lists.friends.map((user) => (
          <UserRow key={user.id} user={user}>
            <RemoveFriendButton userId={user.id} name={user.displayName} />
          </UserRow>
        ))}
      </ListSection>

      <ListSection id="friends-recent" title={t('recentlyActive')} empty={t('noRecentlyActive')}>
        {recent.map((user) => (
          <UserRow key={user.id} user={user} languages={user.languages}>
            <FriendButton action="add" userId={user.id} />
          </UserRow>
        ))}
      </ListSection>

      <RefreshOn events={FRIEND_EVENTS} />
    </div>
  );
}

/** A region named by its heading, so it is found by name. */
function ListSection({
  id,
  title,
  empty,
  children,
}: {
  id: string;
  title: string;
  /** Said instead of an empty list. */
  empty?: string;
  children: ReactNode[];
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 border-t border-slate-800 pt-8">
      <h2 id={id} className="text-lg font-medium">
        {title}
      </h2>
      {children.length === 0 && empty !== undefined ? (
        <p className="text-sm text-slate-400">{empty}</p>
      ) : (
        <ul className="divide-y divide-slate-800">{children}</ul>
      )}
    </section>
  );
}

/** A search row offers only what fits, so a 409 only ever comes from a race. */
async function SearchAction({ relation, userId }: { relation: Relation; userId: string }) {
  const t = await getTranslations('FriendsPage');

  if (relation === 'none') return <FriendButton action="add" userId={userId} />;
  if (relation === 'received') return <FriendButton action="accept" userId={userId} />;
  return (
    <span className="text-sm text-slate-400">
      {t(relation === 'sent' ? 'requestSent' : 'isFriend')}
    </span>
  );
}
