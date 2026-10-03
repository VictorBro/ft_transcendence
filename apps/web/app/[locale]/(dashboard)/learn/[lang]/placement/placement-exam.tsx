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

  const inFlight = useRef<string | null>(null);
  const answer = useCallback(
    async (choice: string | null) => {
      if (question === null || inFlight.current !== null) return;
      inFlight.current = question.questionId;
      setPending(true);
      setError(null);
      try {
        const result = await submitPlacementAnswer(question.questionId, choice);
        if (!result.ok) {
          inFlight.current = null;
          setError(errorMessage(result.code, result.status));
          return;
        }
        setState(result.data);
      } finally {
        inFlight.current = null;
        setPending(false);
      }
    },
    [question, errorMessage],
  );

  // A deadline captured once per question, not a count of ticks: a hidden tab
  // gets its interval throttled, while the server still measures the limit from
  // servedAt. Reading the clock keeps the display honest after a wake-up.
  useEffect(() => {
    if (question === null) {
      return;
    }
    const deadline = Date.now() + question.remainingS * 1000;
    const tick = () => {
      setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    };

    // Four times a second so the last second is not swallowed by a tick landing
    // just past the boundary. It costs no extra render: the ceiling only changes
    // on a whole second, and React bails out on an identical state.
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [question]);

  useEffect(() => {
    if (question === null) {
      return;
    }
    const timer = setTimeout(() => void answer(null), question.remainingS * 1000);
    return () => clearTimeout(timer);
  }, [question, answer]);

  /*
   * Both ways out of the exam, because both have to clear the run server-side
   * before navigating. hasActiveSession only tests for the key, so a run left
   * behind — ended or abandoned — answers 409 to every later start for its full
   * hour. On a failure the page stays put and says why: navigating anyway would
   * strand the learner with a run they can neither finish nor replace.
   */
  async function leave() {
    setPending(true);
    setError(null);
    try {
      const result = await quitPlacement();
      if (!result.ok) {
        setError(errorMessage(result.code, result.status));
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
        <div className="mx-auto flex w-full h-full max-w-2xl flex-col gap-6">
          <h1 className="text-3xl font-semibold">{t('resultHeading')}</h1>
          <div className="flex flex-col gap-1 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 px-10 py-6">
            <span className="text-xs font-semibold tracking-widest text-indigo-300 uppercase">
              {t('levelLabel')}
            </span>
            <span className="text-6xl font-bold text-end text-indigo-300">
              {state.targetLevel ?? t('notPlaced')}
            </span>
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
                  <td
                    className={`py-2 pr-4 ${entry.wasCorrect ? 'text-green-400' : 'text-red-400'}`}
                  >
                    {entry.chosen ?? t('noAnswer')}
                  </td>
                  {/* Filled on every row, right answers included: this table is
                      what the learner revises from, and a blank cell leaves them
                      checking their own answer against nothing. */}
                  <td className="py-2 text-green-400">{entry.correct}</td>
                  {/* Colour alone does not carry the verdict (WCAG 1.4.1), so it
                      is also a name a screen reader reads out. */}
                  <td className="py-2 text-center text-lg">
                    <span role="img" aria-label={entry.wasCorrect ? t('correct') : t('incorrect')}>
                      {entry.wasCorrect ? '✓' : '❌'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <FormError message={error} />

          {/* A button and not a Link: leave() clears the run before navigating. */}
          <button
            type="button"
            onClick={() => void leave()}
            disabled={pending}
            className="self-start rounded-md bg-indigo-600 px-6 py-3 font-medium transition-colors hover:bg-indigo-500 disabled:opacity-60"
          >
            {t('continueButton')}
          </button>
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
        <span role="timer" className="shrink-0">
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
        onClick={() => void leave()}
        disabled={pending}
        className="self-start text-sm text-slate-400 underline underline-offset-4 hover:text-slate-100"
      >
        {t('quitButton')}
      </button>
    </div>
  );
}
