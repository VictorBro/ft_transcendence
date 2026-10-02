'use client';

import type { Language, PlacementQuestion } from '@ft/shared';
import { isPlacementResult, type PlacementState } from '@/lib/placement-schema';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useErrorMessage } from '@/lib/error-message';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FormError } from '@/components/form';
import { quitPlacement, startPlacement, submitPlacementAnswer } from '@/lib/placement-client';

function CountdownRing({ remaining, total }: { remaining: number; total: number }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const offset = circumference * (1 - fraction);
  const urgent = remaining <= 5;

  return (
    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
      <svg viewBox="0 0 48 48" className="h-14 w-14 -rotate-90">
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          className="text-slate-800"
        />
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`transition-[stroke-dashoffset] duration-1000 ease-linear ${
            urgent ? 'text-red-500' : 'text-indigo-500'
          }`}
        />
      </svg>
      <span
        className={`absolute text-sm font-semibold tabular-nums ${
          urgent ? 'text-red-400' : 'text-slate-100'
        }`}
      >
        {remaining}
      </span>
    </div>
  );
}

function ProgressBar({ answered, total }: { answered: number; total: number }) {
  const percentage = total === 0 ? 0 : (answered / total) * 100;
  return (
    <div className="h-2 flex-1 rounded-full bg-slate-800">
      <div
        className="h-full rounded-full bg-indigo-500 transition-all"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

export function PlacementExam({
  lang,
  initial,
}: {
  lang: Language;
  initial: PlacementState | null;
}) {
  const router = useRouter();
  const t = useTranslations('Placement');
  const errorMessage = useErrorMessage();

  const [state, setState] = useState<PlacementState | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const question: PlacementQuestion | null =
    state != null && !isPlacementResult(state) ? state : null;
  const [remaining, setRemaining] = useState(question?.remainingS ?? 0);

  const answer = useCallback(
    async (choice: string | null) => {
      if (question === null) return;
      setPending(true);
      setError(null);
      try {
        const result = await submitPlacementAnswer(question.questionId, choice);
        if (!result.ok) {
          setError(errorMessage(result.code, result.status));
          return;
        }
        setState(result.data);
      } finally {
        setPending(false);
      }
    },
    [question, errorMessage],
  );

  const timeOut = useRef<string | null>(null);

  //The useEffect depends on [question] which means dont
  //touch anything is the question (object) did not
  //change get time allowed for a specific question
  useEffect(() => {
    if (question === null) {
      return;
    }
    setRemaining(question.remainingS);
    timeOut.current = null;
    const interval = setInterval(() => {
      setRemaining((seconds) => {
        const next = Math.max(0, seconds - 1);
        if (next === 0 && timeOut.current !== question.questionId) {
          timeOut.current = question.questionId;
          void answer(null);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [question, answer]);

  async function closePlacement() {
    setPending(true);
    setError(null);
    try {
      const res = await quitPlacement();
      if (!res.ok) {
        setError(errorMessage(res.code, res.status));
        return;
      }
      router.push(`/learn/${lang}`);
    } finally {
      setPending(false);
    }
  }

  async function start() {
    setPending(true);
    setError(null);
    try {
      const result = await startPlacement(lang);
      if (!result.ok) {
        setError(errorMessage(result.code, result.status));
        return;
      }
      setState(result.data);
    } finally {
      setPending(false);
    }
  }

  async function quit() {
    setPending(true);
    try {
      const result = await quitPlacement();
      // if we dont check for !result.ok => redis session stay active
      // and user cannot retake placement. But it may block him from
      // leaving placement in case of an error.
      if (!result.ok) {
        setError(errorMessage(result.code, result.status));
        return;
      }
      router.push('/onboarding');
    } finally {
      setPending(false);
    }
  }

  if (state === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-6 text-center">
        <h1 className="text-3xl font-semibold">{t('startHeading')}</h1>
        <p className="max-w-md text-slate-400">{t('startDescription')}</p>
        <FormError message={error} />
        <button
          type="button"
          onClick={() => void start()}
          disabled={pending}
          className="rounded-md bg-indigo-600 px-6 py-3 font-medium transition-colors hover:bg-indigo-500 disabled:opacity-60"
        >
          {pending ? t('starting') : t('startButton')}
        </button>
      </div>
    );
  }

  if (isPlacementResult(state)) {
    return (
      <div className="-mx-3 -my-3 flex h-full flex-col overflow-y-auto px-3 py-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="mx-auto flex h-full max-w-2xl flex-col gap-6">
          <h1 className="text-3xl font-semibold">{t('resultHeading')}</h1>
          <div className="flex flex-col gap-1 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 px-10 py-6">
            <span className="text-xs font-semibold tracking-widest text-indigo-300 uppercase">
              {t('levelLabel')}
            </span>
            <span className="text-6xl font-bold text-end text-indigo-300">{state.targetLevel}</span>
          </div>

          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-slate-500">
                <th className="pb-2 font-medium">{t('reportQuestion')}</th>
                <th className="pb-2 font-medium">{t('yourAnswer')}</th>
                <th className="pb-2 font-medium">{t('correctAnswer')}</th>
                <th className="pb-2 pl-4 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {state.report.map((entry) => (
                <tr key={entry.questionId} className="border-t border-slate-800">
                  <td className="py-2 pr-4 text-slate-300">{entry.question}</td>
                  <td className="py-2 pr-4 text-slate-300">{entry.chosen ?? t('noAnswer')}</td>
                  {entry.wasCorrect ? (
                    <td className="py-2 text-slate-400"></td>
                  ) : (
                    <td className="py-2 text-slate-400">{entry.correct}</td>
                  )}
                  <td className="py-2 text-center text-lg">
                    <span role="img" aria-label={entry.wasCorrect ? t('correct') : t('incorrect')}>
                      {entry.wasCorrect ? '✓' : '❌'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button
            type="button"
            onClick={() => void closePlacement()}
            disabled={pending}
            className="self-start rounded-md bg-indigo-600 px-6 py-3 font-medium transition-colors hover:bg-indigo-500 disabled:opacity-60"
          >
            {pending ? t('closing') : t('closeButton')}
          </button>
          {/*
            No plain "continue" link here: the Close button above quits the run
            before navigating. Leaving without quitting keeps the session alive in
            Redis for its full hour, and one live session blocks starting another in
            any language — so a link straight out would strand the learner, able to
            read the report but not to retake until the TTL expired.
          */}
          {/* <Link
          href={`/learn/${lang}`}
          className="self-start rounded-md bg-indigo-600 px-6 py-3 font-medium transition-colors hover:bg-indigo-500"
        >
          {t('continueButton')}
        </Link> */}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full h-full max-w-2xl flex-col gap-6 overflow-y-auto py-6">
      <div className="flex items-center justify-between text-sm text-slate-400 gap-7">
        <ProgressBar
          answered={state.progress.answered}
          total={state.progress.answered + state.progress.maxQuestionsRemaining}
        />
        <span role="timer" aria-live="polite" className="shrink-0">
          <CountdownRing remaining={remaining} total={state.timeLimitS} />
        </span>
      </div>

      {state.readText !== undefined && (
        <blockquote className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
          {state.readText}
        </blockquote>
      )}

      <p className="text-xl font-medium">{state.question}</p>

      <div role="group" aria-label={t('optionLabel')} className="flex flex-col gap-3">
        {state.options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => void answer(option)}
            disabled={pending}
            className="rounded-md border border-slate-800 bg-slate-900 px-4 py-2 text-left transition-colors hover:bg-slate-800 disabled:opacity-60"
          >
            {option}
          </button>
        ))}
      </div>

      <FormError message={error} />

      <button
        type="button"
        onClick={() => void quit()}
        disabled={pending}
        className="self-start text-sm text-slate-400 underline underline-offset-4 hover:text-slate-100"
      >
        {t('quitButton')}
      </button>
    </div>
  );
}
