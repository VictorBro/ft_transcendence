'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { type Course, type Level } from '@ft/shared';

import { Link, useRouter } from '@/i18n/navigation';
import { setCourseLevel } from '@/lib/courses-client';
import { nextLevel } from '@/lib/level';
import { useErrorMessage } from '@/lib/error-message';
import { FormError, PRIMARY_BUTTON, SubmitButton } from '@/components/form';
import { Flag } from '@/components/flag';
import { LevelPicker } from '@/components/level-picker';
import { Rocket } from './rocket';

/** Matches the `launch` keyframes in globals.css. */
const LAUNCH_MS = 1500;

/** Less motion means skipping the launch, not freezing on a still frame. */
function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Step two: the level comes from the exam or from the learner. Switching
 * between the two changes no stored fact, so it is the one React state here.
 */
export function ChooseLevel({ course }: { course: Course }) {
  const router = useRouter();
  const t = useTranslations('Onboarding');
  const errorMessage = useErrorMessage();
  const [picking, setPicking] = useState(false);
  // Three states, and the two empty-looking ones differ: undefined is nothing
  // picked yet, null is "I have mastered nothing", which is a real answer.
  const [mastered, setMastered] = useState<Level | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [launching, setLaunching] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mastered === undefined) {
      return;
    }
    setPending(true);
    setError(null);

    const animated = !prefersReducedMotion();
    setLaunching(animated);

    try {
      // Run together, so the launch costs nothing on a slow network.
      const [result] = await Promise.all([
        // The course is one past what they have mastered: the column holds what
        // we teach, never what they already know.
        setCourseLevel(course.lang, { level: nextLevel(mastered) }),
        new Promise((resolve) => setTimeout(resolve, animated ? LAUNCH_MS : 0)),
      ]);

      if (!result.ok) {
        // The rocket must not fly away from a level that was never saved.
        setLaunching(false);
        setError(errorMessage(result.code, result.status));
        return;
      }

      router.replace(`/learn/${course.lang}`);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Flag lang={course.lang} className="h-13 w-auto rounded-sm" />
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold tracking-tight">{t(`language.${course.lang}`)}</h1>
          <p className="text-sm text-slate-400">
            {t('dailyGoalSummary', { minutes: course.dailyGoal })}
          </p>
        </div>
      </div>
      {/* Gone once the picker is open: it offered a choice already made. */}
      {launching || picking ? null : (
        <p className="text-sm text-slate-300">{t('chooseLevelIntro')}</p>
      )}
      {/* The rocket crosses the space the form leaves. Fixed height, so the
          page does not jump. */}
      {launching ? (
        <div className="relative h-64">
          <Rocket bob={false} className="absolute left-1/2 h-16 w-16 animate-launch" />
        </div>
      ) : null}

      {launching || picking ? null : (
        <div className="flex flex-col gap-3">
          <Link href={`/learn/${course.lang}/placement`} className={PRIMARY_BUTTON}>
            {t('takeTest')}
          </Link>

          <button
            type="button"
            onClick={() => setPicking(true)}
            aria-expanded={picking}
            className="inline-flex min-h-11 items-center self-center text-sm text-slate-300 underline underline-offset-4"
          >
            {t('setLevelMyself')}
          </button>
        </div>
      )}

      {picking ? (
        <form
          onSubmit={onSubmit}
          className={`flex flex-col gap-6 ${launching ? 'hidden' : ''}`}
          noValidate
        >
          <LevelPicker value={mastered} onChange={setMastered} />

          <FormError message={error} />

          <div className="flex flex-col gap-4">
            <SubmitButton pending={pending} disabled={mastered === undefined}>
              {t('confirmLevel')}
            </SubmitButton>
            <button
              type="button"
              onClick={() => setPicking(false)}
              className="inline-flex min-h-11 items-center self-center text-sm text-slate-300 underline underline-offset-4"
            >
              {t('back')}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
