'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { LEVELS, type Language, type Level } from '@ft/shared';

import { useRouter } from '@/i18n/navigation';
import { setCourseLevel } from '@/lib/courses-client';
import { useErrorMessage } from '@/lib/error-message';
import { FormError } from '@/components/form';

/**
 * The level as a course setting, a twin of GoalPicker: pick it, it saves. It
 * names the level the course teaches, A1 to C2, where LevelPicker asks what
 * the learner has mastered. Progress in the old level stays: only the
 * proposal follows the new one.
 */
export function DirectLevelPicker({ lang, level }: { lang: Language; level: Level }) {
  const router = useRouter();
  const t = useTranslations('Course');
  const errorMessage = useErrorMessage();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as Level;

    setPending(true);
    setError(null);
    try {
      const result = await setCourseLevel(lang, { level: next });
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
        <span>{t('level')}</span>
        <select
          value={level}
          onChange={onChange}
          disabled={pending}
          className="cursor-pointer rounded-md border border-slate-800 bg-slate-900 py-1 pr-7 pl-2 text-slate-300 transition-colors hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
        >
          {LEVELS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <FormError message={error} />
    </div>
  );
}
