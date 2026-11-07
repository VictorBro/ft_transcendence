import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { UserIdSchema, type PublicUser } from '@ft/shared';

import { Link } from '@/i18n/navigation';
import { Avatar } from '@/components/avatar';
import { FriendButton, RemoveFriendButton, RequestButtons } from '@/components/friend-buttons';
import { PresenceDot } from '@/components/presence-dot';
import { RefreshOn } from '@/components/refresh-on';
import {
  FRIEND_EVENTS,
  loadProfile,
  relationTo,
  requireFriends,
  type Relation,
} from '@/lib/friends';
import { requireUser } from '@/lib/session';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  // No notFound() here: it could race the page's /login redirect. The page 404s.
  if (!UserIdSchema.safeParse(id).success) {
    return {};
  }

  const result = await loadProfile(id);
  return result.status === 'ok' ? { title: result.data.displayName } : {};
}

// Where you stand with someone changes with every request: never prerendered or cached.
export const dynamic = 'force-dynamic';

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  // First, so an anonymous visitor gets /login and not a 404.
  const me = await requireUser();

  const { id } = await params;
  // The API would answer 400, which reads as an outage rather than a wrong address.
  if (!UserIdSchema.safeParse(id).success) {
    notFound();
  }

  const [result, lists] = await Promise.all([loadProfile(id), requireFriends()]);
  if (result.status === 'signed-out') {
    redirect('/login');
  }

  if (result.status === 'unavailable') {
    throw new Error(`Could not load the profile: ${result.reason}`);
  }

  if (result.status === 'not-found') {
    notFound();
  }

  const profile = result.data;
  const t = await getTranslations('UserPage');
  const languageName = await getTranslations('Languages');
  // The API's id, lower case, since the URL may hold the same id in upper case.
  const relation = profile.id === me.id ? 'self' : relationTo(lists, profile.id);
  // Your friends list already says who is online. Anyone not in it, you
  // included, gets no dot: only a friend may see when you are online.
  const friend = lists.friends.find((user) => user.id === profile.id);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-10">
      <section className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          {/* The dot sits beside the heading, not in it, so the heading stays the name alone. */}
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="min-w-0 text-2xl font-semibold tracking-tight wrap-break-word">
              {profile.displayName}
            </h1>
            {friend === undefined ? null : (
              <PresenceDot key={String(friend.online)} userId={friend.id} online={friend.online} />
            )}
          </div>
          <Avatar src={profile.avatarUrl} name={profile.displayName} size={128} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ProfileAction relation={relation} user={profile} />
        </div>
      </section>

      <section
        aria-labelledby="user-courses"
        className="flex flex-col gap-3 border-t border-slate-800 pt-8"
      >
        <h2 id="user-courses" className="text-lg font-medium">
          {t('courses')}
        </h2>
        {profile.courses.length === 0 ? (
          <p className="text-sm text-slate-400">{t('noCourses')}</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {profile.courses.map((course) => (
              <li key={course.lang} className="flex flex-wrap items-baseline gap-x-3 py-3">
                <span className="font-medium">{languageName(course.lang)}</span>
                <span className="text-sm text-slate-300">{course.level ?? t('noLevel')}</span>
                {/* No number at 0, as on the course page. */}
                {course.streak > 0 ? (
                  <span className="text-sm text-slate-400">
                    {t('streak', { count: course.streak })}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <RefreshOn events={FRIEND_EVENTS} />
    </div>
  );
}

/** The friends page's buttons, with a word on where you stand. */
async function ProfileAction({
  relation,
  user,
}: {
  relation: Relation | 'self';
  user: PublicUser;
}) {
  const t = await getTranslations('FriendsPage');
  const status = (key: 'requestSent' | 'requestReceived' | 'isFriend') => (
    <span className="text-sm text-slate-400">{t(key)}</span>
  );

  if (relation === 'self') {
    const profile = await getTranslations('ProfilePage');
    return (
      <Link href="/profile/edit" className="text-sm underline underline-offset-4">
        {profile('editProfile')}
      </Link>
    );
  }
  if (relation === 'none') return <FriendButton action="add" userId={user.id} />;
  if (relation === 'sent') {
    return (
      <>
        {status('requestSent')}
        <FriendButton action="cancelRequest" userId={user.id} />
      </>
    );
  }
  if (relation === 'received') {
    return (
      <>
        {status('requestReceived')}
        <RequestButtons userId={user.id} />
      </>
    );
  }
  return (
    <>
      {status('isFriend')}
      <RemoveFriendButton userId={user.id} name={user.displayName} />
    </>
  );
}
