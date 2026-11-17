'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SERVER_EVENTS, type Conversation } from '@ft/shared';

import { Link, useRouter } from '@/i18n/navigation';
import { AvatarWithDot } from '@/components/presence-dot';
import { useServerEvent, useUnread } from '@/components/tab-socket';
import { UnreadBadge } from '@/components/unread-badge';

/**
 * Every conversation, the latest message first. A new message moves its row
 * up here rather than through RefreshOn: a render costs three or four API calls
 * per tab, and messages come far more often than friend events. Only one from
 * someone not listed yet refreshes the page, since a row needs their name and
 * avatar.
 */
export function ConversationList({
  conversations,
  friendsOnline,
  openId,
}: {
  conversations: Conversation[];
  /** Whether each friend was online at render. Anyone else is no friend and gets no dot. */
  friendsOnline: Partial<Record<string, boolean>>;
  openId: string | null;
}) {
  const t = useTranslations('MessagesPage');
  const router = useRouter();
  // The last message heard per conversation since the render, which may be later than its own.
  const [heard, setHeard] = useState<Partial<Record<string, string>>>({});

  useServerEvent(SERVER_EVENTS.DM_MESSAGE, ({ userId, message }) => {
    if (conversations.some(({ user }) => user.id === userId)) {
      setHeard((last) => ({ ...last, [userId]: message.createdAt }));
    } else {
      router.refresh();
    }
  });

  const latest = ({ user, lastMessageAt }: Conversation) =>
    Math.max(Date.parse(lastMessageAt), Date.parse(heard[user.id] ?? lastMessageAt));
  const ordered = [...conversations].sort((a, b) => latest(b) - latest(a));

  if (ordered.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        {t.rich('noConversations', {
          friends: (chunks) => (
            <Link href="/friends" className="underline underline-offset-4">
              {chunks}
            </Link>
          ),
        })}
      </p>
    );
  }

  return (
    <nav aria-label={t('conversations')}>
      <ul className="flex flex-col gap-1">
        {ordered.map((conversation) => (
          <ConversationRow
            key={conversation.user.id}
            conversation={conversation}
            online={friendsOnline[conversation.user.id]}
            open={conversation.user.id === openId}
          />
        ))}
      </ul>
    </nav>
  );
}

function ConversationRow({
  conversation: { user, unread },
  online,
  open,
}: {
  conversation: Conversation;
  online: boolean | undefined;
  open: boolean;
}) {
  const count = useUnread(user.id, unread);

  return (
    <li>
      {/* No prefetch: a list of people would cost a render each against the rate limit. */}
      <Link
        href={`/chat?with=${user.id}`}
        prefetch={false}
        aria-current={open ? 'page' : undefined}
        className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-slate-900 aria-[current=page]:bg-slate-800"
      >
        <AvatarWithDot user={user} online={online} size={40} />
        <span className="min-w-0 flex-1 truncate">{user.displayName}</span>
        <UnreadBadge count={count} />
      </Link>
    </li>
  );
}
