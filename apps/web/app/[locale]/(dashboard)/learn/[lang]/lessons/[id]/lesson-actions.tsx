'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { LocaleSchema, type Language } from '@ft/shared';

import { FormError, PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/components/form';
import { ConfirmDialog } from '@/components/lesson/confirm-dialog';
import { Link, useRouter } from '@/i18n/navigation';
import { useErrorMessage } from '@/lib/error-message';
import type { LessonStage } from '@/lib/lesson';
import { rememberAttempt, startAttempt, takeChanged } from '@/lib/lesson-client';

/** Starts (or retakes) the lesson, then opens the player. */
function useStartLesson(lang: Language, id: string, playPath: string) {
  const locale = useLocale();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    const result = await startAttempt(lang, id, LocaleSchema.catch('en').parse(locale));
    if (result.ok) {
      rememberAttempt(lang, id, result.data);
      // Pushed, so Back from the player comes to the page before it.
      router.push(playPath);
      return;
    }
    setPending(false);
    setError(errorMessage(result.code, result.status));
  }
  return { start, pending, error };
}

/**
 * Back from the player shows a page from the router's cache, as it was
 * first rendered: when the player moved the attempt since, the page reads
 * itself again. Renders nothing.
 */
export function FreshOnReturn({ lang, id }: { lang: Language; id: string }) {
  const router = useRouter();
  useEffect(() => {
    if (takeChanged(lang, id)) router.refresh();
  }, [lang, id, router]);
  return null;
}

/**
 * The one button of the lesson page, by stage: Start the lesson, Resume
 * the lesson, Resume the exam, or See your results and Retake the lesson.
 * Resume and See your results are links, so they work without JavaScript.
 */
export function LessonActions({
  lang,
  id,
  stage,
  playPath,
  resultsPath,
}: {
  lang: Language;
  id: string;
  stage: LessonStage;
  playPath: string;
  resultsPath: string;
}) {
  const t = useTranslations('Lesson');
  const { start, pending, error } = useStartLesson(lang, id, playPath);

  if (stage === 'new') {
    return (
      <div className="flex flex-col items-start gap-3">
        <button type="button" onClick={start} disabled={pending} className={PRIMARY_BUTTON}>
          {t('start')}
        </button>
        <FormError message={error} />
      </div>
    );
  }

  if (stage === 'running' || stage === 'exam') {
    return (
      <div className="flex flex-col items-start gap-3">
        {stage === 'exam' ? <p className="text-sm text-amber-300">{t('examOpen')}</p> : null}
        <Link href={playPath} className={PRIMARY_BUTTON}>
          {stage === 'exam' ? t('resumeExam') : t('resume')}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Link href={resultsPath} className={PRIMARY_BUTTON}>
        {t('seeResults')}
      </Link>
      <RetakeLesson lang={lang} id={id} playPath={playPath} />
    </div>
  );
}

/** Retake the lesson: asks first, since it replaces the results on show. */
export function RetakeLesson({
  lang,
  id,
  playPath,
}: {
  lang: Language;
  id: string;
  playPath: string;
}) {
  const t = useTranslations('Lesson');
  const dialog = useRef<HTMLDialogElement>(null);
  const { start, pending, error } = useStartLesson(lang, id, playPath);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        disabled={pending}
        className={SECONDARY_BUTTON}
      >
        {t('retake')}
      </button>
      <FormError message={error} />
      <ConfirmDialog
        ref={dialog}
        label={t('retake')}
        no={t('retakeNo')}
        yes={t('retakeYes')}
        onYes={() => {
          dialog.current?.close();
          void start();
        }}
      >
        {t('retakeConfirm')}
      </ConfirmDialog>
    </div>
  );
}
