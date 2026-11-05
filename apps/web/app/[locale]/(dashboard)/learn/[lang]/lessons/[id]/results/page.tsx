import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import type { Language, lessons } from '@ft/shared';

import { PRIMARY_BUTTON } from '@/components/form';
import { playable } from '@/components/lesson/kinds';
import { Link } from '@/i18n/navigation';
import { lessonPaths, lessonTitle, loadLesson } from '@/lib/lesson';
import { cursorOf } from '@/lib/lesson-client';
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

const HEADING = 'text-xs font-semibold tracking-widest text-slate-500 uppercase';

/** One decimal at most, the way the half points add up: 7.5, 12. */
const points = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

/**
 * The results (#146) of the last finished attempt, every part on one
 * page: the finish block, the score, practice and exam, the parts menu
 * (in-page anchors), and every answer. A server component: it renders
 * without JavaScript. Not finished: the lesson page.
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

  return (
    <div className="relative -mx-3 -my-3 flex min-w-0 flex-col px-3 py-3 [scrollbar-width:none] lg:h-full lg:overflow-y-auto [&::-webkit-scrollbar]:hidden">
      <FreshOnReturn lang={course} id={card.id} cursor={cursorOf(read.attempt)} />
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-6 wrap-break-word">
        <Link
          href={`/learn/${course}`}
          className="inline-flex min-h-11 items-center self-start text-sm text-slate-400 underline underline-offset-4 transition-colors hover:text-slate-100"
        >
          {t('backToCourse')}
        </Link>

        {/* The finish block: the daily goal now; #95 adds XP, the challenge and achievements (#97 styles them). */}
        <section
          data-slot="finish"
          className="flex flex-col gap-1 rounded-2xl border border-slate-800 bg-slate-900 p-6"
        >
          {finish.goalJustMet ? (
            <p className="text-lg font-semibold text-green-300">{t('goalReached')}</p>
          ) : null}
          <p className="text-slate-300">
            {t('goalProgress', { done: finish.doneCount, target: finish.target })}
          </p>
          <p className="text-slate-400">{t('best', { score: finish.best })}</p>
        </section>

        <header className="flex flex-col gap-2">
          <p lang={course} className="text-slate-400">
            {card.title}
          </p>
          <h1 className="text-3xl font-semibold">{t('resultsHeading')}</h1>
          <p className="text-2xl font-semibold text-slate-100">
            {t('resultsScore', { score: points(results.score) })}
          </p>
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-slate-300">
            <div className="flex gap-2">
              <dt className="text-slate-400">{t('practice')}</dt>
              <dd className="tabular-nums">
                {t('tally', {
                  earned: points(results.practice.earned),
                  possible: results.practice.possible,
                })}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-400">{t('exam')}</dt>
              <dd className="tabular-nums">
                {t('tally', {
                  earned: points(results.exam.earned),
                  possible: results.exam.possible,
                })}
              </dd>
            </div>
          </dl>
        </header>

        <div className="flex flex-wrap gap-3">
          <Link href={`/learn/${course}`} className={PRIMARY_BUTTON}>
            {t('backToCourse')}
          </Link>
          {playable(read.outline.kind) ? (
            <RetakeLesson lang={course} id={card.id} playPath={paths.play} />
          ) : null}
        </div>

        <nav aria-label={t('parts')} className="flex flex-col gap-2">
          <h2 className={HEADING}>{t('parts')}</h2>
          <ol className="flex flex-wrap gap-2">
            {results.steps.map((step, n) => (
              <li key={n}>
                <a
                  href={`#part-${n + 1}`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-700 px-3 text-sm text-slate-300 transition-colors hover:bg-slate-800"
                >
                  {pick(step.title, locale)}
                  <span className="tabular-nums text-slate-500">
                    {points(step.earned)}/{step.possible}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {results.steps.map((step, n) => (
          <section key={n} id={`part-${n + 1}`} className="flex scroll-mt-4 flex-col gap-3">
            <h2 className="flex items-baseline justify-between gap-3 text-lg font-semibold">
              {pick(step.title, locale)}
              <span className="text-sm font-normal tabular-nums text-slate-400">
                {t('tally', { earned: points(step.earned), possible: step.possible })}
              </span>
            </h2>
            <ol className="flex flex-col gap-3">
              {results.rows
                .filter((row) => row.step === n)
                .map((row, m) => (
                  <ResultRow key={m} row={row} lang={course} locale={locale} />
                ))}
            </ol>
          </section>
        ))}
      </article>
    </div>
  );
}

const TONE: Record<Row['outcome'], string> = {
  fully_correct: 'border-green-500/50',
  orthography_only: 'border-amber-400/60',
  incorrect: 'border-red-500/50',
  unanswered: 'border-red-500/50',
};

/** One answer: the prompt, yours, the correct one, the points and why. */
async function ResultRow({ row, lang, locale }: { row: Row; lang: Language; locale: string }) {
  const t = await getTranslations('Lesson');
  const placement = await getTranslations('Placement');
  const { prompt } = row;
  const gap = prompt.before !== undefined || prompt.after !== undefined;
  // The marks cover a typed answer; a spotted word's answer ("est → es") shows plain.
  const marks = row.marks && row.marks.map((m) => m.text).join('') === row.yours ? row.marks : null;

  return (
    <li
      data-outcome={row.outcome}
      className={`flex flex-col gap-2 rounded-xl border bg-slate-900/60 p-4 ${TONE[row.outcome]}`}
    >
      <div className="flex items-start justify-between gap-3">
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
