'use client';

import { useId, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { useRouter } from '@/i18n/navigation';
import type { ApiResult } from '@/lib/api-client';
import { useErrorMessage } from '@/lib/error-message';
import {
  acceptFriendRequest,
  deleteFriendRequest,
  removeFriend,
  sendFriendRequest,
} from '@/lib/friends-client';
import { FormError, PRIMARY_BUTTON, SECONDARY_BUTTON, WARN_BUTTON } from './form';

type Action = 'add' | 'accept' | 'decline' | 'cancelRequest';

// A name rather than the function, since a server page renders these. The
// label is the FriendsPage key of the same name.
const ACTIONS = {
  add: { write: sendFriendRequest, style: PRIMARY_BUTTON },
  accept: { write: acceptFriendRequest, style: PRIMARY_BUTTON },
  decline: { write: deleteFriendRequest, style: SECONDARY_BUTTON },
  cancelRequest: { write: deleteFriendRequest, style: SECONDARY_BUTTON },
} satisfies Record<
  Action,
  { write: (userId: string) => Promise<ApiResult<unknown>>; style: string }
>;

/**
 * One write, then the page again from the server whatever the answer: a
 * failure is nearly always the other side moving first, which the fresh page
 * shows. Pending lasts until that page is in, so the old button cannot be
 * clicked twice.
 */
function useFriendWrite() {
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(write: () => Promise<ApiResult<unknown>>) {
    startTransition(async () => {
      const result = await write();
      // After an await, updates need their own transition to stay in this one.
      startTransition(() => {
        setError(result.ok ? null : errorMessage(result.code, result.status));
        // Offline, the refresh cannot reach the server either, and its failure
        // reloads the page over the message.
        if (result.ok || result.status !== 0) router.refresh();
      });
    });
  }
  return { pending, error, run };
}

export function FriendButton({ action, userId }: { action: Action; userId: string }) {
  const t = useTranslations('FriendsPage');
  const { pending, error, run } = useFriendWrite();
  const { write, style } = ACTIONS[action];

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => write(userId))}
        className={style}
      >
        {t(action)}
      </button>
      <RowError message={error} />
    </>
  );
}

/** Accept and Decline share one write, so neither can be clicked while the other runs. */
export function RequestButtons({ userId }: { userId: string }) {
  const t = useTranslations('FriendsPage');
  const { pending, error, run } = useFriendWrite();

  return (
    <>
      {(['accept', 'decline'] as const).map((action) => (
        <button
          key={action}
          type="button"
          disabled={pending}
          onClick={() => run(() => ACTIONS[action].write(userId))}
          className={ACTIONS[action].style}
        >
          {t(action)}
        </button>
      ))}
      <RowError message={error} />
    </>
  );
}

/**
 * Asks first, with the placement quit dialog's pattern: a modal dialog brings
 * the focus trap and Escape, and Cancel comes first, so the safe choice has
 * the focus.
 */
export function RemoveFriendButton({ userId, name }: { userId: string; name: string }) {
  const t = useTranslations('FriendsPage');
  const dialog = useRef<HTMLDialogElement>(null);
  const questionId = useId();
  const { pending, error, run } = useFriendWrite();

  function remove() {
    dialog.current?.close();
    run(() => removeFriend(userId));
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => dialog.current?.showModal()}
        className={WARN_BUTTON}
      >
        {t('remove')}
      </button>

      <dialog
        ref={dialog}
        aria-labelledby={questionId}
        className="m-auto w-[min(24rem,calc(100%-2rem))] rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-100 backdrop:bg-slate-950/70"
      >
        <form method="dialog" className="flex flex-col gap-6">
          <p id={questionId} className="wrap-break-word">
            {t('removeConfirm', { name })}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button className={SECONDARY_BUTTON}>{t('cancel')}</button>
            <button
              type="button"
              onClick={remove}
              className="rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-400"
            >
              {t('remove')}
            </button>
          </div>
        </form>
      </dialog>
      <RowError message={error} />
    </>
  );
}

// On its own line, under the row's name and buttons.
function RowError({ message }: { message: string | null }) {
  return message === null ? null : (
    <div className="basis-full">
      <FormError message={message} />
    </div>
  );
}
