'use client';

import { useTranslations } from 'next-intl';
import type { Language, Level } from '@ft/shared';

import { Link } from '@/i18n/navigation';
import { FormError, SubmitButton } from '@/components/form';

export function StartScreen({
  lang,
  courseLevel,
  exit,
  pending,
  error,
  onStart,
}: {
  lang: Language;
  courseLevel: Level | null;
  exit: string;
  pending: boolean;
  error: string | null;
  onStart: () => void;
}) {
  const t = useTranslations('Placement');
  const languageName = useTranslations('Languages');

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onStart();
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto flex w-full max-w-md flex-col gap-6 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('startHeading')}</h1>
      <p className="text-sm text-slate-300">
        {t('startDescription', { language: languageName(lang) })}
      </p>
      {/* Finishing writes a new level, which a placed learner should know first. */}
      {courseLevel === null ? null : (
        <p className="text-sm text-slate-400">{t('startCurrent', { level: courseLevel })}</p>
      )}

      <FormError message={error} />

      <div className="flex flex-col gap-4">
        <SubmitButton pending={pending}>{t('startButton')}</SubmitButton>
        <Link
          href={exit}
          className="inline-flex min-h-11 items-center self-center text-sm text-slate-300 underline underline-offset-4"
        >
          {t('back')}
        </Link>
      </div>
    </form>
  );
}
