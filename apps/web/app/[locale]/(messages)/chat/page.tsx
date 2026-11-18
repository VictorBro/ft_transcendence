import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { UserIdInputSchema } from '@ft/shared';

import { Link } from '@/i18n/navigation';
import { RefreshOn } from '@/components/refresh-on';
import { loadMessagePage, requireConversations } from '@/lib/conversations';
import { FRIEND_EVENTS, requireFriends } from '@/lib/friends';
import { requireUser } from '@/lib/session';
import { ChatThread } from './chat-thread';
import { ConversationList } from './conversation-list';

// One key feeds this title, the heading and the link in the account menu.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('MessagesPage');

  return { title: t('title') };
}

// Renders one specific person's conversations, so it must never be prerendered or cached.
export const dynamic = 'force-dynamic';

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ with?: string | string[] }>;
}) {
  const [me, conversations, lists] = await Promise.all([
    requireUser(),
    requireConversations(),
    requireFriends(),
  ]);

  // A hand-edited ?with= is ignored rather than an error, as on /friends: the
  // list alone.
  const parsed = UserIdInputSchema.safeParse((await searchParams).with);
  const withId = parsed.success ? parsed.data : null;
  // Someone you may write to, or share a conversation with: nobody else has a thread here.
  const friend = lists.friends.find((user) => user.id === withId);
  const other = friend ?? conversations.find(({ user }) => user.id === withId)?.user;
  const page = other === undefined ? null : await loadMessagePage(other.id);

  const friendsOnline = Object.fromEntries(lists.friends.map((user) => [user.id, user.online]));
  const t = await getTranslations('MessagesPage');

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div className="flex flex-col gap-2">
        {/* A phone shows the list or the thread, never both. */}
        {other === undefined ? null : (
          <Link href="/chat" className="self-start text-sm underline underline-offset-4 lg:hidden">
            {t('allMessages')}
          </Link>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row">
        {/* relative: a scrolling pane, see Shell. */}
        <div
          className={`relative lg:w-80 lg:shrink-0 lg:overflow-y-auto ${other === undefined ? '' : 'max-lg:hidden'}`}
        >
          <ConversationList
            conversations={conversations}
            friendsOnline={friendsOnline}
            open={other ?? null}
          />
        </div>

        {other === undefined || page === null ? (
          <p className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-800 p-6 text-slate-400 max-lg:hidden">
            {t('choose')}
          </p>
        ) : (
          // Keyed, so another conversation starts afresh while a refresh keeps this one.
          <ChatThread
            key={other.id}
            user={other}
            online={friend?.online}
            page={page}
            me={me.id}
            timeZone={me.timeZone}
          />
        )}
      </div>

      {/* A friendship that starts or ends changes who may write, and the dots. */}
      <RefreshOn events={FRIEND_EVENTS} />
    </div>
  );
}
