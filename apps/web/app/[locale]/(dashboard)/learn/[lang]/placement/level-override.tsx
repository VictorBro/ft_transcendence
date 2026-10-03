'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { LEVELS, type Language, type Level } from '@ft/shared';

import { setCourseLevel } from '@/lib/courses-client';
import { useErrorMessage } from '@/lib/error-message';
import { FormError, SubmitButton } from '@/components/form';

/**
 * "Not your level?" under the verdict. The pick is the course level itself,
 * A1 to C2, written through the same route as onboarding's own choice.
 */
export function LevelOverride({
  lang,
  level,
  onSaved,
}: {
  lang: Language;
  level: Level | null;
  onSaved: (level: Level) => void;
}) {
  const t = useTranslations('Placement');
  const errorMessage = useErrorMessage();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Level | null>(level);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (picked === null) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await setCourseLevel(lang, { level: picked });
      if (!result.ok) {
        setError(errorMessage(result.code, result.status));
        return;
      }
      onSaved(picked);
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-sm text-slate-300 underline underline-offset-4"
      >
        {t('overrideButton')}
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <fieldset className="flex flex-col gap-3 border-0 p-0">
        <legend className="mb-1 text-sm font-medium">{t('overrideLegend')}</legend>
        <div className="grid grid-cols-6 gap-2">
          {LEVELS.map((option) => (
            <label
              key={option}
              className="cursor-pointer rounded-md border border-slate-700 px-1 py-2 text-center text-sm has-checked:border-slate-100 has-checked:bg-slate-100 has-checked:text-slate-900 sm:px-4"
            >
              <input
                type="radio"
                name="level"
                value={option}
                checked={picked === option}
                onChange={() => setPicked(option)}
                className="sr-only"
              />
              {option}
            </label>
          ))}
        </div>
      </fieldset>

      <FormError message={error} />

      {/* Keeping the same level would write nothing worth a request. */}
      <SubmitButton pending={pending} disabled={picked === null || picked === level}>
        {t('overrideSubmit')}
      </SubmitButton>
    </form>
  );
}
