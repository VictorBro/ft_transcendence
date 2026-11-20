'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import {
  MessageTextSchema,
  SERVER_EVENTS,
  type Message,
  type MessagePage,
  type PublicUser,
} from '@ft/shared';

import { Link } from '@/i18n/navigation';
import { FormError, PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/components/form';
import { AvatarWithDot } from '@/components/presence-dot';
import {
  markRead,
  sendMessage,
  useServerEvent,
  useSocketStatus,
  useUnreadCounts,
} from '@/components/tab-socket';
import { fetchEarlierMessages, fetchNewestMessages } from '@/lib/conversations-client';
import { useErrorMessage } from '@/lib/error-message';
import { addEarlier, catchUp, mergeMessages, timeFormat } from '@/lib/thread';

// How far from the end of the pane still counts as reading the newest message.
const NEAR_END_PX = 80;

/**
 * One conversation: the messages, oldest first, and the box to write in. The
 * props are where it starts; from there it keeps itself current: every
 * dm:message for this conversation, and the newest page again on each
 * connect, for whatever came while the tab was away.
 */
export function ChatThread({
  user,
  online,
  page: rendered,
  me,
  timeZone,
}: {
  user: PublicUser;
  /** Whether this friend was online at render. Undefined for someone no longer a friend: no dot, no box. */
  online?: boolean;
  /** The newest page at render. */
  page: MessagePage;
  me: string;
  /** The reader's, for the times. */
  timeZone: string;
}) {
  const t = useTranslations('MessagesPage');
  const errorMessage = useErrorMessage();
  const status = useSocketStatus();
  const counts = useUnreadCounts();
  const visible = usePageVisible();
  const [page, setPage] = useState(rendered);
  const [earlier, setEarlier] = useState<{ loading: boolean; error: string | null }>({
    loading: false,
    error: null,
  });
  const pane = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  // Set before a change that should end on the newest message, and used up
  // once it is on screen. Set for the first paint too.
  const stick = useRef(true);
  // What the thread holds, for the catch-up to read when it starts: a ref, so
  // a new message does not start it again.
  const shown = useRef(page.messages);
  // The message that was first before Load earlier, to bring back to the top.
  const anchor = useRef<string | null>(null);
  const headingId = useId();
  const friend = online !== undefined;

  useServerEvent(SERVER_EVENTS.DM_MESSAGE, ({ userId, message }) => {
    if (userId !== user.id) return;
    stick.current ||= message.senderId === me || atNewest(pane.current, bottom.current);
    setPage((held) => ({ ...held, messages: mergeMessages(held.messages, [message]) }));
  });

  useEffect(() => {
    shown.current = page.messages;
  }, [page.messages]);

  // On every connect, the first included and on mount when already connected:
  // a message sent while the tab was away, or before this listened, comes in
  // with the newest page.
  useEffect(() => {
    if (status !== 'connected') return;
    let current = true;
    // Taken now: a message heard during the fetch says nothing about the gap.
    const before = shown.current;
    void fetchNewestMessages(user.id).then((result) => {
      if (!current || !result.ok) return;
      stick.current ||= atNewest(pane.current, bottom.current);
      setPage((held) => catchUp(held, result.data, before));
    });
    return () => {
      current = false;
    };
  }, [status, user.id]);

  // Read while it is in front of the reader. Every read is answered with a
  // snapshot, a new `counts` even when unchanged, so a message that landed
  // while the read was out gets read too.
  useEffect(() => {
    if (visible && status === 'connected' && (counts?.[user.id] ?? 0) > 0) markRead(user.id);
  }, [visible, status, counts, user.id]);

  // After paint, so it runs after Next's own scroll to the top of a new page.
  useEffect(() => {
    if (!stick.current) return;
    stick.current = false;
    showNewest(pane.current, bottom.current);
  }, [page.messages]);

  // After Load earlier, the message that was first goes back to the top, where
  // the reader was: left alone, the older page pushes it down. Before paint, so
  // the jump never shows.
  useLayoutEffect(() => {
    const id = anchor.current;
    if (id === null) return;
    anchor.current = null;
    pane.current?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'start' });
  }, [page.messages]);

  async function loadEarlier(cursor: string) {
    const first = page.messages[0]?.id ?? null;
    setEarlier({ loading: true, error: null });
    const result = await fetchEarlierMessages(user.id, cursor);
    if (result.ok) {
      anchor.current = first;
      setPage((held) => addEarlier(held, cursor, result.data));
    }
    setEarlier({
      loading: false,
      error: result.ok ? null : errorMessage(result.code, result.status),
    });
  }

  const cursor = page.nextCursor;

  return (
    <section
      aria-labelledby={headingId}
      className="flex min-h-96 min-w-0 flex-1 flex-col rounded-2xl border border-slate-800 lg:min-h-0"
    >
      <header className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
        <AvatarWithDot user={user} online={online} size={32} />
        <h2 id={headingId} className="min-w-0 truncate font-semibold">
          <Link
            href={`/users/${user.id}`}
            prefetch={false}
            className="underline underline-offset-4"
          >
            {user.displayName}
          </Link>
        </h2>
      </header>

      {/* The scrolling pane from `lg`; below it the page scrolls. relative, see Shell. */}
      <div ref={pane} className="relative flex flex-1 flex-col gap-4 p-4 lg:overflow-y-auto">
        {cursor === null ? null : (
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              disabled={earlier.loading}
              onClick={() => void loadEarlier(cursor)}
              className={SECONDARY_BUTTON}
            >
              {t('loadEarlier')}
            </button>
            <FormError message={earlier.error} />
          </div>
        )}
        {page.messages.length === 0 ? (
          <p className="text-center text-sm text-slate-400">{t('noMessages')}</p>
        ) : null}
        {/* Always there, so a screen reader hears the first message arrive too. */}
        <div role="log" aria-labelledby={headingId}>
          <ol className="flex flex-col gap-3">
            {page.messages.map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                mine={message.senderId === me}
                name={user.displayName}
                timeZone={timeZone}
              />
            ))}
          </ol>
        </div>
      </div>

      <div ref={bottom} className="border-t border-slate-800 p-4">
        {friend ? (
          <Composer userId={user.id} />
        ) : (
          <p className="text-sm text-slate-400">{t('onlyFriends')}</p>
        )}
      </div>
    </section>
  );
}

function MessageItem({
  message,
  mine,
  name,
  timeZone,
}: {
  message: Message;
  mine: boolean;
  name: string;
  timeZone: string;
}) {
  const t = useTranslations('MessagesPage');
  const format = useFormatter();
  const options = timeFormat(message.createdAt, timeZone, new Date());

  return (
    // max-w-full on the bubble: a word of 1,000 letters wraps rather than widening the page.
    <li
      data-id={message.id}
      className={`flex max-w-[80%] flex-col gap-1 ${mine ? 'items-end self-end' : 'items-start'}`}
    >
      <p
        className={`max-w-full rounded-2xl px-4 py-2 whitespace-pre-wrap wrap-break-word ${mine ? 'bg-slate-100 text-slate-900' : 'bg-slate-800 text-slate-100'}`}
      >
        {/* The side tells the eye who wrote it; this tells a screen reader. */}
        <span className="sr-only">{mine ? t('you') : name}: </span>
        {message.text}
      </p>
      {/* The server and the browser may word a time a little differently (their
          ICU data), or disagree on today around midnight: no hydration error. */}
      <time
        dateTime={message.createdAt}
        className="text-xs text-slate-400"
        suppressHydrationWarning
      >
        {format.dateTime(new Date(message.createdAt), options)}
      </time>
    </li>
  );
}

/**
 * The box: Enter sends, Shift+Enter starts a new line. One send at a time:
 * the box is read-only until the ack, so the text cleared after it is the text
 * that was sent. On failure the text stays, to send again. The message joins
 * the thread as a dm:message, which reaches the sending tab before the ack.
 */
function Composer({ userId }: { userId: string }) {
  const t = useTranslations('MessagesPage');
  const errorMessage = useErrorMessage();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();

  async function send() {
    if (sending) return;
    const parsed = MessageTextSchema.safeParse(text);
    if (!parsed.success) {
      setError(errorMessage(parsed.error.issues[0]?.message ?? 'unknown'));
      return;
    }

    setSending(true);
    const result = await sendMessage(userId, parsed.data);
    setSending(false);
    if (!result.ok) {
      setError(errorMessage(result.code));
      return;
    }
    setText('');
    setError(null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // An Enter that ends an IME composition only confirms the word. Safari ends
    // the composition before this keydown, so there only keyCode 229 tells.
    const { isComposing, keyCode } = event.nativeEvent;
    if (event.key !== 'Enter' || event.shiftKey || isComposing || keyCode === 229) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
      className="flex flex-col gap-2"
    >
      <label htmlFor={inputId} className="sr-only">
        {t('messageLabel')}
      </label>
      <div className="flex items-end gap-3">
        <textarea
          id={inputId}
          name="message"
          rows={2}
          value={text}
          readOnly={sending}
          onChange={(event) => {
            setText(event.target.value);
            // It was about the text before this change.
            setError(null);
          }}
          onKeyDown={onKeyDown}
          placeholder={t('messageLabel')}
          aria-describedby={errorId}
          className="min-w-0 flex-1 resize-none rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-slate-100"
        />
        <button type="submit" disabled={sending} className={PRIMARY_BUTTON}>
          {t('send')}
        </button>
      </div>
      <div id={errorId}>
        <FormError message={error} />
      </div>
    </form>
  );
}

function subscribeVisibility(watch: () => void): () => void {
  document.addEventListener('visibilitychange', watch);
  return () => document.removeEventListener('visibilitychange', watch);
}

/** Whether the tab is in front: a hidden one must not mark anything read. */
function usePageVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === 'visible',
    () => false,
  );
}

/**
 * At the newest message: the pane scrolled to its end (from `lg`, where it
 * scrolls) and the bottom of the thread on screen (below, where the page does).
 */
function atNewest(pane: HTMLElement | null, bottom: HTMLElement | null): boolean {
  if (pane === null || bottom === null) return false;
  const paneAtEnd = pane.scrollHeight - pane.scrollTop - pane.clientHeight < NEAR_END_PX;
  return paneAtEnd && bottom.getBoundingClientRect().top < window.innerHeight;
}

function showNewest(pane: HTMLElement | null, bottom: HTMLElement | null): void {
  if (pane === null || bottom === null) return;
  pane.scrollTop = pane.scrollHeight;
  bottom.scrollIntoView({ block: 'nearest' });
}
