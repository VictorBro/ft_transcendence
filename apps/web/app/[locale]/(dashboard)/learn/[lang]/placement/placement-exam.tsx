'use client';

import { useRef, useState } from 'react';
import type { Language, Level } from '@ft/shared';

import { useRouter } from '@/i18n/navigation';
import type { ApiResult } from '@/lib/api-client';
import { useErrorMessage } from '@/lib/error-message';
import { quitPlacement, startPlacement, submitPlacementAnswer } from '@/lib/placement-client';
import { isPlacementResult, type PlacementState } from '@/lib/placement-schema';
import { QuestionScreen } from './question-screen';
import { ResultScreen } from './result-screen';
import { StartScreen } from './start-screen';

/** An answer refused with one of these finds the run expired, dropped or out of questions. */
const RUN_GONE = new Set([
  'placement.notFound',
  'placement.invalidSession',
  'placement.poolExhausted',
]);

export function PlacementExam({
  lang,
  courseLevel,
  initial,
}: {
  lang: Language;
  courseLevel: Level | null;
  initial: PlacementState | null;
}) {
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const [state, setState] = useState<PlacementState | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Kept after a success: the old question's timer can still fire before React
  // swaps the next one in, and must not post a stale null for it.
  const answering = useRef<string | null>(null);
  // The course as this page knows it: the server's level, then whatever an
  // applied run or a pick on the result writes, with no reload in between.
  const [level, setLevel] = useState<Level | null>(courseLevel);

  // Onboarding owns an unplaced course, the course page a placed one.
  const exit = level === null ? `/onboarding?lang=${lang}` : `/learn/${lang}`;

  async function send<T>(request: () => Promise<ApiResult<T>>): Promise<ApiResult<T>> {
    setPending(true);
    setError(null);
    try {
      return await request();
    } finally {
      setPending(false);
    }
  }

  function fail(result: { code: string; status: number }) {
    setError(errorMessage(result.code, result.status));
  }

  async function start() {
    const result = await send(() => startPlacement(lang));
    if (result.ok) {
      setState(result.data);
    } else {
      fail(result);
    }
  }

  async function answer(questionId: string, choice: string | null) {
    if (answering.current === questionId) {
      return;
    }
    answering.current = questionId;
    const result = await send(() => submitPlacementAnswer(questionId, choice));
    if (result.ok) {
      setState(result.data);
      if (isPlacementResult(result.data) && result.data.applied) {
        setLevel(result.data.targetLevel);
      }
      return;
    }
    answering.current = null;
    // A dead question with only an error under it is a dead end; Start is not.
    if (RUN_GONE.has(result.code)) {
      setState(null);
    }
    fail(result);
  }

  async function quit() {
    // The delete is idempotent: a run already gone answers 204 too.
    const result = await send(quitPlacement);
    if (result.ok) {
      router.push(exit);
    } else {
      fail(result);
    }
  }

  return (
    <div className="-mx-3 -my-3 flex min-w-0 flex-col px-3 py-3 scrollbar-none [&::-webkit-scrollbar]:hidden lg:h-full lg:overflow-y-auto">
      {state === null ? (
        <StartScreen
          lang={lang}
          courseLevel={level}
          exit={exit}
          pending={pending}
          error={error}
          onStart={start}
        />
      ) : isPlacementResult(state) ? (
        <ResultScreen
          result={state}
          level={level}
          onLevelChange={setLevel}
          exit={exit}
          pending={pending}
          error={error}
          onRetake={start}
        />
      ) : (
        <QuestionScreen
          question={state}
          pending={pending}
          error={error}
          onAnswer={answer}
          onQuit={quit}
        />
      )}
    </div>
  );
}
