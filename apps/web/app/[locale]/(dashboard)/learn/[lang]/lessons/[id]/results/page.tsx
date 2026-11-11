import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import type { Language, lessons } from '@ft/shared';

import { PRIMARY_BUTTON } from '@/components/form';
import { playable } from '@/components/lesson/kinds';
import { ResultsReview } from '@/components/lesson/results-review';
import { Link } from '@/i18n/navigation';
import { lessonPaths, lessonTitle, loadLesson } from '@/lib/lesson';
import { cursorOf } from '@/lib/lesson-cursor';
import { pick } from '@/lib/localized';
import { FreshOnReturn, RetakeLesson } from '../lesson-actions';

/** The results change with every retake: never cached. */
export const dynamic = 'force-dynamic';

type Params = Promise<{ lang: string; id: string }>;
type Results = lessons.player.Results;
type Row = Results['rows'][number];

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, id } = await params;
  const t = await getTranslations('Lesson');
  const title = await lessonTitle(lang, id);
  return { title: title === null ? t('resultsHeading') : `${t('resultsHeading')}: ${title}` };
}

/** One decimal at most, the way the half points add up: 7.5, 12. */
const points = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

/**
 * The existing results page (#146): the server renders the saved scores
 * and answers; the sidebar selects the part being reviewed. Anchor targets
 * also expose parts without JavaScript. Not finished: the lesson page.
 */
export default async function ResultsPage({ params }: { params: Params }) {
  const { lang, id } = await params;
  const { lang: course, card, read } = await loadLesson(lang, id);
  const paths = lessonPaths(course, card.id);
  const results = read.attempt?.results ?? null;
  if (results === null) {
    redirect(paths.page);
  }

  const t = await getTranslations('Lesson');
  const locale = await getLocale();
  const { finish } = results;

  const languages = await getTranslations('Languages');
  return (
    <div className="lesson-view">
      <FreshOnReturn lang={course} id={card.id} cursor={cursorOf(read.attempt)} />
      <ResultsReview
        results={results}
        title={card.title}
        caption={`${languages(course)} / ${card.level}`}
        summary={
          <section data-slot="finish" className="lesson-finish-summary">
            {finish.goalJustMet ? (
              <p className="font-semibold text-green-300">{t('goalReached')}</p>
            ) : null}
            <p>{t('goalProgress', { done: finish.doneCount, target: finish.target })}</p>
            <p className="text-slate-400">{t('best', { score: finish.best })}</p>
            <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-slate-300">
              <div className="flex gap-2">
                <dt>{t('practice')}</dt>
                <dd>
                  {t('tally', {
                    earned: points(results.practice.earned),
                    possible: results.practice.possible,
                  })}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt>{t('exam')}</dt>
                <dd>
                  {t('tally', {
                    earned: points(results.exam.earned),
                    possible: results.exam.possible,
                  })}
                </dd>
              </div>
            </dl>
          </section>
        }
        actions={
          <>
            {playable(read.outline.kind) ? (
              <RetakeLesson lang={course} id={card.id} playPath={paths.play} />
            ) : null}
            <Link href={`/learn/${course}`} className={PRIMARY_BUTTON}>
              {t('backToCourse')}
            </Link>
          </>
        }
      >
        {results.steps.map((_step, n) => (
          <section key={n} className="flex flex-col gap-4">
            <ol className="lesson-result-rows">
              {results.rows
                .filter((row) => row.step === n)
                .map((row, m) => (
                  <ResultRow key={m} row={row} lang={course} locale={locale} />
                ))}
            </ol>
          </section>
        ))}
      </ResultsReview>
    </div>
  );
}

/** A gender row: "cahier: ~~Feminine~~ → Masculine", then why when it was wrong. */
async function GenderRow({
  row,
  lang,
  locale,
  label,
}: {
  row: Row;
  lang: Language;
  locale: string;
  label: (gender: string) => string;
}) {
  const t = await getTranslations('Lesson');
  const placement = await getTranslations('Placement');
  const right = row.outcome === 'fully_correct';
  return (
    <li
      data-outcome={row.outcome}
      className={`lesson-result-row lesson-gender-result flex flex-col gap-1 ${TONE[row.outcome]}`}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={right ? 'text-green-400' : 'text-red-400'}>
          {right ? '✓' : '✕'}
        </span>
        <p className="flex flex-1 flex-wrap items-baseline gap-x-3">
          <span lang={lang} className="text-slate-200">
            {row.prompt.learning}:
          </span>
          {right ? null : row.yours === null ? (
            <span className="text-slate-500">
              {row.timedOut ? placement('noAnswer') : t('blank')}
            </span>
          ) : (
            <span className="text-red-400 line-through">
              <span className="sr-only">{placement('yourAnswer')}: </span>
              {label(row.yours)}
            </span>
          )}
          {right ? null : <span aria-hidden="true">→</span>}
          <strong className="font-semibold text-green-400">
            {right ? null : <span className="sr-only">{placement('correctAnswer')}: </span>}
            {label(row.answer)}
          </strong>
        </p>
        <span className="shrink-0 text-sm font-semibold text-slate-300 tabular-nums">
          {t('points', { points: points(row.points) })}
        </span>
      </div>
      {right ? null : <p className="pl-7 text-slate-400">{pick(row.explanation, locale)}</p>}
    </li>
  );
}

const TONE: Record<Row['outcome'], string> = {
  fully_correct: 'border-green-500/50',
  orthography_only: 'border-amber-400/60',
  incorrect: 'border-red-500/50',
  unanswered: 'border-red-500/50',
};

/** The answers the interface words: a gender row ("masculine"), as on the gender results screen. */
const GENDERS = new Set(['masculine', 'feminine', 'neuter']);

/** One answer: the prompt, yours, the correct one, the points and why. */
async function ResultRow({ row, lang, locale }: { row: Row; lang: Language; locale: string }) {
  const t = await getTranslations('Lesson');
  const placement = await getTranslations('Placement');
  const genders = await getTranslations('Genders');
  const { prompt } = row;
  if (GENDERS.has(row.answer) && (row.yours === null || GENDERS.has(row.yours))) {
    return <GenderRow row={row} lang={lang} locale={locale} label={(g) => genders(g)} />;
  }
  const gap = prompt.before !== undefined || prompt.after !== undefined;
  // The marks cover a typed answer; a spotted word's answer ("est → es") shows plain.
  const marks = row.marks && row.marks.map((m) => m.text).join('') === row.yours ? row.marks : null;

  return (
    <li
      data-outcome={row.outcome}
      className={`lesson-result-row flex flex-col gap-2 ${TONE[row.outcome]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          aria-hidden="true"
          className={`pt-0.5 font-bold ${row.outcome === 'fully_correct' ? 'text-green-400' : row.outcome === 'orthography_only' ? 'text-amber-300' : 'text-red-400'}`}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path
              d={
                row.outcome === 'fully_correct'
                  ? 'M3 9l4 4L15 5'
                  : row.outcome === 'orthography_only'
                    ? 'M3 7c4-4 8 4 12 0M3 11c4-4 8 4 12 0'
                    : 'M4 4l10 10M14 4L4 14'
              }
            />
          </svg>
        </span>
        <p className="flex flex-col">
          {gap ? (
            <span lang={lang} className="text-slate-100">
              {prompt.before} ___ {prompt.after}
            </span>
          ) : null}
          {prompt.learning !== undefined ? (
            <span lang={lang} className="text-slate-100">
              {prompt.learning}
            </span>
          ) : null}
          {prompt.native !== undefined ? (
            <span className="text-slate-400">{prompt.native}</span>
          ) : null}
        </p>
        <span
          className={`shrink-0 text-sm font-semibold tabular-nums ${
            row.outcome === 'orthography_only' ? 'text-amber-300' : 'text-slate-300'
          }`}
        >
          {t('points', { points: points(row.points) })}
        </span>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt className="text-slate-400">{placement('yourAnswer')}</dt>
        <dd>
          {row.yours === null ? (
            <span className="text-slate-500">
              {row.timedOut ? placement('noAnswer') : t('blank')}
            </span>
          ) : (
            <span lang={lang}>
              {marks
                ? marks.map((mark, n) => (
                    <span key={n} className={mark.wrong ? 'text-red-300 underline' : undefined}>
                      {mark.text}
                    </span>
                  ))
                : row.yours}
            </span>
          )}
        </dd>
        <dt className="text-slate-400">{placement('correctAnswer')}</dt>
        <dd lang={lang} className="text-green-300">
          {row.accepted ?? row.answer}
        </dd>
      </dl>
      {row.outcome === 'orthography_only' ? (
        <p className="text-sm text-amber-300">{t('halfPoint')}</p>
      ) : null}
      <p className="text-sm text-slate-300">{pick(row.explanation, locale)}</p>
    </li>
  );
}
