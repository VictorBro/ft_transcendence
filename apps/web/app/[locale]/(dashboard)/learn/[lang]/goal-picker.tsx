'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CourseSchema, DAILY_GOALS, type DailyGoal, type Language } from '@ft/shared';

import { useRouter } from '@/i18n/navigation';
import { clientPatch } from '@/lib/api-client';
import { useErrorMessage } from '@/lib/error-message';
import { FormError } from '@/components/form';

/** Saves on change: three values and no other field, so a button adds a click. */
export function GoalPicker({ lang, dailyGoal }: { lang: Language; dailyGoal: DailyGoal }) {
  const router = useRouter();
  const t = useTranslations('Course');
  const errorMessage = useErrorMessage();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const dailyGoal = Number(event.target.value) as DailyGoal;

    setPending(true);
    setError(null);
    try {
      const result = await clientPatch(CourseSchema, `/api/courses/${lang}`, { dailyGoal });
      if (!result.ok) {
        setError(errorMessage(result.code, result.status));
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-sm text-slate-400">
        <span>{t('dailyGoal')}</span>
        <select
          value={dailyGoal}
          onChange={onChange}
          disabled={pending}
          className="cursor-pointer rounded-md border border-slate-800 bg-slate-900 py-1 pr-7 pl-2 text-slate-300 transition-colors hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
        >
          {DAILY_GOALS.map((goal) => (
            <option key={goal} value={goal}>
              {t('minutesPerDay', { minutes: goal })}
            </option>
          ))}
        </select>
      </label>
      <FormError message={error} />
    </div>
  );
}
