'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { lessons } from '@ft/shared';

import { pick } from '@/lib/localized';
import { resultPart } from '@/lib/result-part';
import { resultScoreTone } from '@/lib/result-score-tone';

type Results = lessons.player.Results;
const points = (value: number) => (Number.isInteger(value) ? `${value}` : value.toFixed(1));
const tone = (earned: number, possible: number) =>
  resultScoreTone(possible ? (100 * earned) / possible : 0);

const subscribeToHash = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
};
const currentHash = () => window.location.hash;
const serverHash = () => '';

/** Review selection only changes presentation; the saved result and scores stay untouched. */
export function ResultsReview({
  results,
  title,
  caption,
  summary,
  actions,
  children,
}: {
  results: Results;
  title: string;
  caption: string;
  summary: ReactNode;
  actions: ReactNode;
  children: ReactNode[];
}) {
  const t = useTranslations('Lesson');
  const locale = useLocale();
  const firstExam = Math.max(
    0,
    results.steps.findIndex((step) => step.role === 'exam'),
  );
  // Native anchors keep deep links, reloads, Back/Forward and the no-script
  // fallback in sync. The server cannot see a fragment; CSS handles it before hydration.
  const hash = useSyncExternalStore(subscribeToHash, currentHash, serverHash);
  const selected = resultPart(hash, results.steps.length, firstExam);
  const step = results.steps[selected];
  const firstPractice = results.steps.findIndex((item) => item.role === 'practice' && item.scored);
  const exams = results.steps.flatMap((item, index) => (item.role === 'exam' ? [index] : []));
  const choice = (index: number, nested = false) => {
    const item = results.steps[index]!;
    return (
      <a
        key={index}
        href={`#part-${index + 1}`}
        aria-current={selected === index ? 'true' : undefined}
        className={`lesson-result-choice ${nested ? 'is-nested' : ''} ${index === firstPractice ? 'is-practice-start' : ''} ${tone(item.earned, item.possible)}`}
      >
        <span>{pick(item.title, locale)}</span>
        <span className="shrink-0 tabular-nums">
          {points(item.earned)} / {item.possible}
        </span>
      </a>
    );
  };

  return (
    <div className="lesson-layout lesson-results">
      <aside className="lesson-sidebar lesson-results-sidebar" aria-label={t('parts')}>
        <p className="lesson-nav-kicker">{t('resultsHeading')}</p>
        <p className="lesson-final-score">{t('resultsScore', { score: points(results.score) })}</p>
        <nav aria-label={t('parts')} className="flex flex-col gap-2">
          <a
            href={`#part-${firstExam + 1}`}
            className={`lesson-result-choice ${tone(results.exam.earned, results.exam.possible)}`}
            aria-current={step?.role === 'exam' ? 'true' : undefined}
          >
            <span>{t('finalExam')}</span>
            <span className="shrink-0">
              {points(results.exam.earned)} / {results.exam.possible}
            </span>
          </a>
          {exams.length > 1 ? exams.map((index) => choice(index, true)) : null}
          {results.steps.flatMap((item, index) =>
            item.role === 'practice' && item.scored ? [choice(index)] : [],
          )}
        </nav>
      </aside>
      <article className="lesson-main flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">{t('resultsHeading')}</h1>
        <header
          className={`lesson-results-banner ${resultScoreTone(step?.possible ? (100 * step.earned) / step.possible : 0)}`}
        >
          <p className="text-base text-slate-300">{caption}</p>
          <h2 className="text-3xl font-semibold">
            {step?.role === 'exam'
              ? t('finalExam')
              : step
                ? pick(step.title, locale)
                : t('resultsHeading')}
          </h2>
          <p className="text-5xl font-bold tabular-nums">
            {points(step?.earned ?? 0)} / {step?.possible ?? 0}
          </p>
          <p className="text-lg font-semibold">{title}</p>
        </header>
        {summary}
        {children.map((panel, index) => (
          <div
            key={index}
            id={`part-${index + 1}`}
            data-selected={selected === index}
            className="lesson-result-panel"
          >
            {panel}
          </div>
        ))}
        <div className="flex flex-wrap justify-end gap-3">{actions}</div>
      </article>
    </div>
  );
}
