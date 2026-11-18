'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  DISCUSSION_LIMITS,
  LessonDiscussionSchema,
  type Language,
  type LessonDiscussionInput,
} from '@ft/shared';

import { FormError, PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/components/form';
import { sendDiscussion } from '@/lib/discussion-client';
import { useErrorMessage } from '@/lib/error-message';

/** One earlier turn: the learner's or the tutor's. */
type DiscussionTurn = LessonDiscussionInput['history'][number];

/** The message on its way, and the answer so far. */
interface Asking {
  message: string;
  answer: string;
  /** Set when the answer failed: the reason, translated. The answer so far stays. */
  error: string | null;
}

/**
 * The tutor of the discussion page (#151): the learner asks about the
 * lesson, the answer shows as it comes (#150's stream).
 *
 * The server keeps nothing between two messages: the turns live here, and
 * each message sends them back, the last DISCUSSION_LIMITS.historyTurns.
 * They are gone when the page is: the discussion is never stored.
 *
 * onStale: a 409, the attempt moved on elsewhere. The player reads it again.
 */
export function Discussion({
  lang,
  id,
  attemptId,
  onStale,
}: {
  lang: Language;
  id: string;
  attemptId: string;
  onStale: (code: string, status: number) => void;
}) {
  const t = useTranslations('Lesson');
  const tError = useTranslations('ErrorPage');
  const errorMessage = useErrorMessage();

  const [turns, setTurns] = useState<DiscussionTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [asking, setAsking] = useState<Asking | null>(null);
  // A message refused before it left (zod, as the API checks it).
  const [invalid, setInvalid] = useState<string | null>(null);
  // After a 429: when the learner may ask again, and the clock that counts down to it.
  const [waitUntil, setWaitUntil] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  // The running send: Stop aborts it, and so does the page going away.
  const running = useRef<AbortController | null>(null);

  useEffect(() => () => running.current?.abort(), []);

  useEffect(() => {
    if (waitUntil === null) return;
    const timer = window.setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= waitUntil) setWaitUntil(null);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [waitUntil]);

  const streaming = asking !== null && asking.error === null;
  const waiting = waitUntil !== null;
  const busy = streaming || waiting;

  /** Puts an unanswered message back in the box, unless the learner typed another since. */
  const restore = (message: string) => setDraft((current) => (current === '' ? message : current));

  /**
   * Sends one message. fromBox: typed in the box, which it then empties, and
   * gets back when nothing was answered. A suggested prompt leaves the box as it is.
   */
  async function ask(message: string, fromBox: boolean) {
    const parsed = LessonDiscussionSchema.safeParse({
      attemptId,
      message,
      history: turns.slice(-DISCUSSION_LIMITS.historyTurns),
    });
    if (!parsed.success) {
      setInvalid(errorMessage(parsed.error.issues[0]?.message ?? 'request.invalid'));
      return;
    }
    const controller = new AbortController();
    running.current = controller;
    setInvalid(null);
    if (fromBox) setDraft('');
    setAsking({ message: parsed.data.message, answer: '', error: null });

    let answer = '';
    const result = await sendDiscussion(
      lang,
      id,
      parsed.data,
      (text) => {
        answer += text;
        setAsking((current) => current && { ...current, answer });
      },
      controller.signal,
    );
    running.current = null;

    // Done, or stopped: the answer so far joins the turns. Stopped before
    // any word, the message goes back to the box.
    if (result.ok || controller.signal.aborted) {
      setAsking(null);
      if (answer === '') {
        if (fromBox) restore(parsed.data.message);
      } else
        setTurns((current) => [
          ...current,
          { role: 'user', text: parsed.data.message },
          // The API takes no longer turn; an answer never comes near it.
          { role: 'assistant', text: answer.slice(0, DISCUSSION_LIMITS.turnText) },
        ]);
      return;
    }
    if (result.status === 409) {
      setAsking(null);
      onStale(result.code, result.status);
      return;
    }
    if (result.status === 429) {
      // Nothing was asked: the message waits in the box until the countdown ends.
      setAsking(null);
      if (fromBox) restore(parsed.data.message);
      const time = Date.now();
      setNow(time);
      setWaitUntil(time + (result.retryAfter ?? 60) * 1000);
      return;
    }
    setAsking({
      message: parsed.data.message,
      answer,
      error: errorMessage(result.code, result.status),
    });
  }

  const seconds = waitUntil === null ? 0 : Math.max(1, Math.ceil((waitUntil - now) / 1000));
  const prompts = [t('explainMistakes'), t('promptSummary'), t('promptExample')];
  const shown: DiscussionTurn[] = asking
    ? [...turns, { role: 'user', text: asking.message }, { role: 'assistant', text: asking.answer }]
    : turns;
  // The index of an answer cut short by an error, or -1.
  const cut = asking?.error ? shown.length - 1 : -1;

  return (
    <section
      data-slot="discussion"
      aria-label={t('tutor')}
      className="flex flex-col gap-4 rounded-2xl border border-dashed border-slate-700 p-4 sm:p-6"
    >
      <ul className="flex flex-wrap gap-2" aria-label={t('suggestions')}>
        {prompts.map((prompt) => (
          <li key={prompt}>
            <button
              type="button"
              disabled={busy}
              onClick={() => void ask(prompt, false)}
              className={SECONDARY_BUTTON}
            >
              {prompt}
            </button>
          </li>
        ))}
      </ul>

      {shown.length > 0 ? (
        // Busy while the answer comes: a screen reader reads it once, whole.
        <ol className="flex flex-col gap-3" aria-live="polite" aria-busy={streaming}>
          {shown.map((turn, n) =>
            // The answer not started yet: nothing to show but Stop.
            turn.text === '' ? null : (
              <li
                key={n}
                data-turn={turn.role}
                // The failed answer, last of the list: dimmed and trailing off,
                // so it reads as cut short, not finished, above its error.
                data-interrupted={n === cut || undefined}
                className={
                  turn.role === 'user'
                    ? 'self-end rounded-2xl bg-slate-800 px-4 py-2 whitespace-pre-wrap text-slate-100'
                    : n === cut
                      ? 'whitespace-pre-wrap text-slate-400'
                      : 'whitespace-pre-wrap text-slate-200'
                }
              >
                <span className="sr-only">{turn.role === 'user' ? t('you') : t('tutor')}: </span>
                {turn.text}
                {n === cut ? <span aria-hidden="true">…</span> : null}
              </li>
            ),
          )}
        </ol>
      ) : null}

      {asking?.error ? (
        <div className="flex flex-wrap items-center gap-3">
          <FormError message={asking.error} />
          <button
            type="button"
            // The box may hold a new message by now: Try again leaves it alone.
            onClick={() => void ask(asking.message, false)}
            className={SECONDARY_BUTTON}
          >
            {tError('tryAgain')}
          </button>
        </div>
      ) : null}

      {waiting ? (
        <p role="status" className="text-sm text-amber-200">
          {t('tooManyQuestions', { seconds })}
        </p>
      ) : null}

      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && draft.trim() !== '') void ask(draft, true);
        }}
      >
        <label className="flex flex-1 flex-col gap-2">
          <span className="sr-only">{t('yourQuestion')}</span>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter starts a new line; not while an input method composes.
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            // Open while the answer comes, so the focus stays here: only a 429 closes it.
            disabled={waiting}
            rows={2}
            maxLength={DISCUSSION_LIMITS.message}
            placeholder={t('yourQuestion')}
            className="resize-y rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-slate-100 disabled:opacity-60"
          />
        </label>
        {/*
          Keyed apart: the same <button> turned into Send while the click on Stop
          still runs (the abort answers at once), and the end of that click then
          sent the form. A new element starts its own click, the old one is gone.
        */}
        {streaming ? (
          <button
            key="stop"
            type="button"
            // The second click of a double-click on Send lands here: only single clicks stop.
            onClick={(event) => {
              if (event.detail <= 1) running.current?.abort();
            }}
            className={SECONDARY_BUTTON}
          >
            {t('stop')}
          </button>
        ) : (
          <button
            key="send"
            type="submit"
            disabled={busy || draft.trim() === ''}
            // The same the other way: a double-click on Stop must not send again.
            onClick={(event) => {
              if (event.detail > 1) event.preventDefault();
            }}
            className={PRIMARY_BUTTON}
          >
            {t('send')}
          </button>
        )}
      </form>
      <FormError message={invalid} />
    </section>
  );
}
