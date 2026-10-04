'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { PlacementQuestion } from '@ft/shared';

import { FormError, SECONDARY_BUTTON } from '@/components/form';

export function QuestionScreen({
  question,
  pending,
  error,
  onAnswer,
  onQuit,
}: {
  question: PlacementQuestion;
  pending: boolean;
  error: string | null;
  onAnswer: (questionId: string, choice: string | null) => void;
  onQuit: () => void;
}) {
  const t = useTranslations('Placement');
  const { questionId, lang, progress } = question;

  return (
    // Breaks a word only where it cannot fit: German compounds outrun a phone.
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 pb-6 wrap-break-word">
      {/* Sticky, so a long passage never scrolls the clock out of sight. */}
      <div className="sticky top-0 z-10 flex items-center gap-6 bg-slate-950/90 py-3 backdrop-blur">
        <ProgressBar
          answered={progress.answered}
          total={progress.answered + progress.maxQuestionsRemaining}
        />
        <Countdown
          // Remounted per question, so the ring starts full instead of
          // sweeping over from the last question's value.
          key={questionId}
          remainingS={question.remainingS}
          timeLimitS={question.timeLimitS}
          onExpire={() => onAnswer(questionId, null)}
        />
      </div>

      {/* lang on the course's text, for the right voice and hyphenation. */}
      {question.readText === undefined ? null : (
        <blockquote
          lang={lang}
          className="rounded-2xl border border-slate-800 bg-slate-900 p-4 leading-relaxed text-slate-200 hyphens-auto"
        >
          {question.readText}
        </blockquote>
      )}

      <h1 lang={lang} className="text-xl font-medium hyphens-auto">
        {question.question}
      </h1>

      <div role="group" aria-label={t('optionLabel')} className="flex flex-col gap-3">
        {question.options.map((option) => (
          <button
            key={option}
            lang={lang}
            type="button"
            onClick={() => onAnswer(questionId, option)}
            disabled={pending}
            className="min-h-12 rounded-md border border-slate-800 bg-slate-900 px-4 py-3 text-left transition-colors hover:bg-slate-800 disabled:opacity-60"
          >
            {option}
          </button>
        ))}
      </div>

      <FormError message={error} />

      <QuitButton onQuit={onQuit} />
    </div>
  );
}

/** Decorative: the count is a ceiling that shrinks as the exam settles, not a total. */
function ProgressBar({ answered, total }: { answered: number; total: number }) {
  return (
    <div className="h-2 flex-1 rounded-full bg-slate-800" aria-hidden>
      <div
        className="h-full rounded-full bg-indigo-500 transition-all"
        style={{ width: `${total === 0 ? 0 : (answered / total) * 100}%` }}
      />
    </div>
  );
}

function Countdown({
  remainingS,
  timeLimitS,
  onExpire,
}: {
  remainingS: number;
  timeLimitS: number;
  onExpire: () => void;
}) {
  const t = useTranslations('Placement');
  // A deadline, not a count of ticks: a hidden tab gets its timers throttled,
  // while the server goes on measuring the limit from when it served the question.
  const [deadline] = useState(() => Date.now() + remainingS * 1000);
  const [left, setLeft] = useState(remainingS);
  const expire = useEffectEvent(onExpire);

  useEffect(() => {
    // Four ticks a second, so the last one is not swallowed by a tick landing
    // just past it. Only a whole second changes state, so the rest cost nothing.
    const interval = setInterval(() => {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setLeft(seconds);
      if (seconds === 0) {
        clearInterval(interval);
        expire();
      }
    }, 250);
    return () => clearInterval(interval);
  }, [deadline]);

  const urgent = left <= 5;

  return (
    <div
      role="timer"
      aria-label={t('timeLeft')}
      className="relative flex size-14 shrink-0 items-center justify-center"
    >
      <svg viewBox="0 0 48 48" className="size-14 -rotate-90" aria-hidden>
        <circle cx="24" cy="24" r="20" fill="none" strokeWidth="4" className="stroke-slate-800" />
        <circle
          cx="24"
          cy="24"
          r="20"
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - Math.min(1, left / timeLimitS)}
          className={`transition-[stroke-dashoffset] duration-1000 ease-linear ${
            urgent ? 'stroke-red-500' : 'stroke-indigo-500'
          }`}
        />
      </svg>
      <span
        className={`absolute text-sm font-semibold tabular-nums ${
          urgent ? 'text-red-400' : 'text-slate-100'
        }`}
      >
        {left}
      </span>
    </div>
  );
}

/**
 * Quitting throws away every answer, and a stray tap is easy on a phone, so it
 * asks first. A modal dialog brings the focus trap and Escape for free, and
 * opens on the safe choice, the first button in it.
 */
function QuitButton({ onQuit }: { onQuit: () => void }) {
  const t = useTranslations('Placement');
  const dialog = useRef<HTMLDialogElement>(null);

  function quit() {
    dialog.current?.close();
    onQuit();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="inline-flex min-h-11 items-center self-start text-sm text-slate-400 underline underline-offset-4 transition-colors hover:text-slate-100"
      >
        {t('quitButton')}
      </button>

      <dialog
        ref={dialog}
        aria-label={t('quitButton')}
        className="m-auto w-[min(24rem,calc(100%-2rem))] rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-100 backdrop:bg-slate-950/70"
      >
        <form method="dialog" className="flex flex-col gap-6">
          <p>{t('quitConfirm')}</p>
          <div className="grid grid-cols-2 gap-3">
            <button className={SECONDARY_BUTTON}>{t('quitConfirmNo')}</button>
            <button
              type="button"
              onClick={quit}
              className="rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-400"
            >
              {t('quitConfirmYes')}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
