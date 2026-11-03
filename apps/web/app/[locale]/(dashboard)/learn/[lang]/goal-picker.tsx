'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CourseSchema, DAILY_GOALS, type DailyGoal, type Language } from '@ft/shared';

import { clientPatch } from '@/lib/api-client';
import { useCourseSave } from '@/lib/use-course-save';
import { FormError } from '@/components/form';

/**
 * Saves on change: three values and no other field, so a button adds a click.
 * The pick shows at once and the select stays enabled while it saves, so the
 * focus stays on it. A refused save falls back to the stored goal.
 */
export function GoalPicker({ lang, dailyGoal }: { lang: Language; dailyGoal: DailyGoal }) {
  const t = useTranslations('Course');
  const { error, save } = useCourseSave();
  const [value, setValue] = useState(dailyGoal);

  useEffect(() => setValue(dailyGoal), [dailyGoal]);

  async function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = Number(event.target.value) as DailyGoal;

    setValue(next);
    if (
      !(await save(() => clientPatch(CourseSchema, `/api/courses/${lang}`, { dailyGoal: next })))
    ) {
      setValue(dailyGoal);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-sm text-slate-400">
        <span>{t('dailyGoal')}</span>
        <select
          value={value}
          onChange={onChange}
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
