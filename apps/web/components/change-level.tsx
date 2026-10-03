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
 * A modal dialog, like quitting the exam: it floats over the page instead of
 * pushing it around, and brings the focus trap, Escape and the way back to the
 * trigger for free.
 */
export function ChangeLevel({
  lang,
  level,
  label,
  onSaved,
  className = 'inline-flex min-h-11 items-center self-start text-sm text-slate-300 underline underline-offset-4 transition-colors hover:text-slate-100',
}: {
  lang: Language;
  level: Level;
  label: string;
  /** Without it the page refreshes to show the new level. */
  onSaved?: (level: Level) => void;
  /** The trigger's look: a link in running text unless told otherwise. */
  className?: string;
}) {
  const router = useRouter();
  const t = useTranslations('Level');
  const errorMessage = useErrorMessage();
  const dialog = useRef<HTMLDialogElement>(null);
  const [mastered, setMastered] = useState(() => masteredBelow(level));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const target = nextLevel(mastered);

  // Each opening starts over from the course as it is now.
  function open() {
    setMastered(masteredBelow(level));
    setError(null);
    dialog.current?.showModal();
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
      dialog.current?.close();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" onClick={open} className={className}>
        {label}
      </button>

      <dialog
        ref={dialog}
        aria-label={label}
        className="m-auto w-[min(36rem,calc(100%-2rem))] rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-100 backdrop:bg-slate-950/70"
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
          <LevelPicker value={mastered} onChange={setMastered} />
          <FormError message={error} />
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className={SECONDARY_BUTTON}
            >
              {t('cancel')}
            </button>
            <SubmitButton pending={pending} disabled={target === level}>
              {t('save')}
            </SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
