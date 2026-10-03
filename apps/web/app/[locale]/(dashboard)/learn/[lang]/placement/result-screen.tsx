'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import type { Language, Level, PlacementReportEntry, PlacementResult } from '@ft/shared';

import { Link } from '@/i18n/navigation';
import { masteredBelow } from '@/lib/level';
import { ChangeLevel } from '@/components/change-level';
import { FormError, PRIMARY_BUTTON } from '@/components/form';
import { LevelSummary } from '@/components/level-picker';

/**
 * The verdict and what to do with it first, then the answers to revise from. A
 * run that was not applied left the course alone, so it gets a notice instead.
 */
export function ResultScreen({
  result,
  level,
  onLevelChange,
  exit,
  pending,
  error,
  onRetake,
}: {
  result: PlacementResult;
  /**
   * The course's level, which is the verdict unless the learner changed it or
   * the run was not applied. Null is a course not placed yet.
   */
  level: Level | null;
  onLevelChange: (level: Level) => void;
  /** Where the course is when the run left it alone. */
  exit: string;
  pending: boolean;
  error: string | null;
  onRetake: () => void;
}) {
  const t = useTranslations('Placement');
  const course = useTranslations('Course');
  const answersHeading = useId();
  const { lang, report } = result;
  const correct = report.filter((entry) => entry.wasCorrect).length;
  // Only narrows: an applied run always leaves the course a level.
  const applied = result.applied && level !== null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-10 py-6 wrap-break-word">
      <section className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('resultHeading')}</h1>

        {applied ? (
          <LevelSummary mastered={masteredBelow(level)}>
            <div className="flex items-end justify-between gap-4">
              <p className="flex flex-col gap-1">
                <span className="text-xs font-semibold tracking-widest text-slate-500 uppercase">
                  {course('level')}
                </span>
                <span className="text-5xl font-bold">{level}</span>
              </p>
              <p className="text-sm text-slate-400">
                {t('score', { correct, total: report.length })}
              </p>
            </div>
          </LevelSummary>
        ) : (
          <p className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-slate-200 sm:p-6">
            {level === null ? t('allTimedOutNoLevel') : t('allTimedOut', { level })}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Link
            href={applied ? `/learn/${lang}` : exit}
            className={`${PRIMARY_BUTTON} sm:self-start sm:px-8`}
          >
            {t('continueButton')}
          </Link>
          {applied ? (
            <ChangeLevel
              lang={lang}
              level={level}
              label={t('overrideButton')}
              onSaved={onLevelChange}
            />
          ) : null}
          <FormError message={error} />
          <button
            type="button"
            onClick={onRetake}
            disabled={pending}
            className="inline-flex min-h-11 items-center self-start text-sm text-slate-300 underline underline-offset-4 transition-colors hover:text-slate-100 disabled:opacity-60"
          >
            {t('retakeButton')}
          </button>
        </div>
      </section>

      <section aria-labelledby={answersHeading} className="flex flex-col gap-2">
        <h2 id={answersHeading} className="text-lg font-semibold">
          {t('answersHeading')}
        </h2>
        <ol className="flex flex-col divide-y divide-slate-800">
          {report.map((entry) => (
            <Answer key={entry.questionId} entry={entry} lang={lang} />
          ))}
        </ol>
      </section>
    </div>
  );
}

function Answer({ entry, lang }: { entry: PlacementReportEntry; lang: Language }) {
  const t = useTranslations('Placement');

  return (
    <li className="flex gap-3 py-4">
      <Verdict correct={entry.wasCorrect} />
      <div className="flex min-w-0 flex-1 flex-col gap-2 hyphens-auto">
        {entry.readText === undefined ? null : (
          <details className="text-sm text-slate-400">
            <summary className="cursor-pointer">{t('showText')}</summary>
            <p lang={lang} className="mt-2 leading-relaxed text-slate-300">
              {entry.readText}
            </p>
          </details>
        )}
        <p lang={lang} className="text-slate-200">
          {entry.question}
        </p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          <dt className="text-slate-500">{t('yourAnswer')}</dt>
          {entry.chosen === null ? (
            <dd className="text-red-400">{t('noAnswer')}</dd>
          ) : (
            <dd lang={lang} className={entry.wasCorrect ? 'text-green-400' : 'text-red-400'}>
              {entry.chosen}
            </dd>
          )}
          {/* A right answer is its own correction. */}
          {entry.wasCorrect ? null : (
            <>
              <dt className="text-slate-500">{t('correctAnswer')}</dt>
              <dd lang={lang} className="text-green-400">
                {entry.correct}
              </dd>
            </>
          )}
        </dl>
      </div>
      <QuestionLevel level={entry.level} />
    </li>
  );
}

/** The bare code is for the eye; a screen reader hears what it stands for. */
function QuestionLevel({ level }: { level: Level }) {
  const t = useTranslations('Placement');

  return (
    <span className="mt-0.5 shrink-0 self-start rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300">
      <span aria-hidden>{level}</span>
      <span className="sr-only">{t('questionLevel', { level })}</span>
    </span>
  );
}

/** Drawn rather than a glyph, which fonts render as anything from an emoji to a box. */
function Verdict({ correct }: { correct: boolean }) {
  const t = useTranslations('Placement');

  return (
    <svg
      role="img"
      aria-label={correct ? t('correct') : t('incorrect')}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`mt-0.5 size-5 shrink-0 ${correct ? 'text-green-400' : 'text-red-400'}`}
    >
      <path d={correct ? 'M5 12.5l4.5 4.5L19 7' : 'M6 6l12 12M18 6 6 18'} />
    </svg>
  );
}
