'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Language, Level } from '@ft/shared';

import { useRouter } from '@/i18n/navigation';
import { setCourseLevel } from '@/lib/courses-client';
import { useErrorMessage } from '@/lib/error-message';
import { masteredBelow, nextLevel } from '@/lib/level';
import { FormError, SECONDARY_BUTTON, SubmitButton } from './form';
import { LevelPicker } from './level-picker';

/**
 * Sets a course's level without an exam. The picker opens on the mastery the
 * current level stands for, so Save stays off until the pick changes the course.
 */
export function ChangeLevel({
  lang,
  level,
  label,
  onSaved,
}: {
  lang: Language;
  level: Level;
  label: string;
  /** Without it the page refreshes to show the new level. */
  onSaved?: (level: Level) => void;
}) {
  const router = useRouter();
  const t = useTranslations('Level');
  const errorMessage = useErrorMessage();
  const toggle = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [mastered, setMastered] = useState<Level | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const target = nextLevel(mastered);

  function show() {
    setMastered(masteredBelow(level));
    setOpen(true);
  }

  // The buttons that closed it are gone, so focus goes back where it started.
  function close() {
    setOpen(false);
    setError(null);
    toggle.current?.focus();
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await setCourseLevel(lang, { level: target });
      if (!result.ok) {
        setError(errorMessage(result.code, result.status));
        return;
      }
      if (onSaved) {
        onSaved(target);
      } else {
        router.refresh();
      }
      close();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        ref={toggle}
        type="button"
        onClick={open ? close : show}
        aria-expanded={open}
        className="inline-flex min-h-11 items-center self-start text-sm text-slate-300 underline underline-offset-4 transition-colors hover:text-slate-100"
      >
        {label}
      </button>

      {open ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <LevelPicker value={mastered} onChange={setMastered} />
          <FormError message={error} />
          <div className="grid grid-cols-2 gap-3">
            <SubmitButton pending={pending} disabled={target === level}>
              {t('save')}
            </SubmitButton>
            <button type="button" onClick={close} className={SECONDARY_BUTTON}>
              {t('cancel')}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
