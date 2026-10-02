'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { LEARNABLE_LANGUAGES, type DailyGoal, type Language } from '@ft/shared';

import { Link, useRouter } from '@/i18n/navigation';
import { startCourse } from '@/lib/courses-client';
import { useErrorMessage } from '@/lib/error-message';
import { FormError, SubmitButton } from '@/components/form';
import { Flag } from '@/components/flag';

/** Typed against DailyGoal, so a value the schema drops stops compiling here. */
const DAILY_GOALS: readonly DailyGoal[] = [10, 30, 60];

/** Step one. "Next" writes the course at once, which is what lets step two
 *  survive a refresh or an abandoned exam. */
export function ChooseCourse({
  studied,
  activeLang,
  preselected,
}: {
  studied: readonly Language[];
  activeLang: Language | null;
  /** The language the learner came from, via /onboarding?lang=. */
  preselected: Language | null;
}) {
  const router = useRouter();
  const t = useTranslations('Onboarding');
  const errorMessage = useErrorMessage();
  const available = LEARNABLE_LANGUAGES.filter((option) => !studied.includes(option));
  const locked = available.length === 0;
  // One language left means there is nothing to decide, so it starts selected.
  const [lang, setLang] = useState<Language | null>(
    preselected ?? (available.length === 1 ? available[0] : null),
  );
  const [dailyGoal, setDailyGoal] = useState<DailyGoal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const result = await startCourse({ lang, dailyGoal });

      // A studied language cannot be picked, so course.alreadyStarted only
      // reaches here when a second tab started the same one first.
      if (!result.ok) {
        setError(errorMessage(result.code, result.status));
        return;
      }

      // A stale ?lang= would keep step one open when another language was picked.
      router.replace(`/onboarding?lang=${result.data.lang}`);
      // Without this the server never re-reads, and the page stays on step one.
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-8" noValidate>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('chooseCourseHeading')}</h1>
        <p className="text-sm text-slate-300">
          {locked ? t('noNewLanguage') : t('chooseCourseIntro')}
        </p>
      </div>

      <fieldset className="flex flex-col gap-3 border-0 p-0">
        <legend className="mb-1 text-sm font-medium">{t('languageLegend')}</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {LEARNABLE_LANGUAGES.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-700 px-4 py-2 text-sm has-checked:border-slate-100 has-checked:bg-slate-100 has-checked:text-slate-900 has-disabled:cursor-not-allowed has-disabled:opacity-40"
            >
              <input
                type="radio"
                name="lang"
                value={option}
                checked={lang === option}
                disabled={studied.includes(option)}
                onChange={() => setLang(option)}
                className="sr-only"
              />
              <Flag lang={option} />
              {t(`language.${option}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 border-0 p-0">
        <legend className="mb-1 text-sm font-medium">{t('goalLegend')}</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {DAILY_GOALS.map((option) => (
            <label
              key={option}
              className="cursor-pointer rounded-md border border-slate-700 px-4 py-2 text-center text-sm has-checked:border-slate-100 has-checked:bg-slate-100 has-checked:text-slate-900 has-disabled:cursor-not-allowed has-disabled:opacity-40"
            >
              <input
                type="radio"
                name="dailyGoal"
                value={option}
                checked={dailyGoal === option}
                disabled={locked}
                onChange={() => setDailyGoal(option)}
                className="sr-only"
              />
              {t('goalMinutes', { minutes: option })}
            </label>
          ))}
        </div>
      </fieldset>

      <FormError message={error} />

      {/* Laid out like step two: a full-width primary, the secondary centred
       *  under it. A column also stretches the button, which is what every
       *  other form in the app does. */}
      <div className="flex flex-col gap-4">
        <SubmitButton pending={pending} disabled={locked || lang === null || dailyGoal === null}>
          {t('next')}
        </SubmitButton>

        {/* The way out of a screen with nothing left to offer. */}
        {locked && activeLang !== null ? (
          <Link
            href={`/learn/${activeLang}`}
            className="self-center text-sm underline underline-offset-4"
          >
            {t('backToCourse', { language: t(`languageInSentence.${activeLang}`) })}
          </Link>
        ) : null}
      </div>
    </form>
  );
}
