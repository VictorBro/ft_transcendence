import { getTranslations } from 'next-intl/server';
import { LESSON_MINUTES, type Language, type LessonCard, type Level, type Today } from '@ft/shared';
import { ProgressBar } from '@ft/ui';

import { Link } from '@/i18n/navigation';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/components/form';
import { lessonPath } from '@/lib/lessons';
import { StartLevel } from './start-level';

const HEADING = 'text-xs font-semibold tracking-widest text-slate-500 uppercase';
const BADGE = 'rounded-full border border-slate-700 px-2 py-0.5 text-xs font-medium text-slate-300';

/** The streak sentence above the Today card. ICU plurals, one line in every state. */
export async function StreakLine({ streak }: { streak: Today['streak'] }) {
  const t = await getTranslations('Course');

  if (streak.current === 0) {
    return <p className="text-slate-400">{t('streakStart')}</p>;
  }
  return (
    <p className="text-slate-400">
      {t(streak.today ? 'streakToday' : 'streakKeep', { count: streak.current })}
    </p>
  );
}

/**
 * Title and summary in the course language, like placement questions: the
 * `lang` attribute lets a screen reader say them with the right voice.
 */
function LessonText({ lesson, lang }: { lesson: LessonCard; lang: Language }) {
  return (
    <div lang={lang} className="flex min-w-0 flex-col">
      <span className="font-medium text-slate-100">{lesson.title}</span>
      <span className="text-sm text-slate-400">{lesson.summary}</span>
    </div>
  );
}

function CheckIcon({ passed }: { passed: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${
        passed ? 'bg-green-500/15 text-green-300' : 'bg-amber-500/15 text-amber-300'
      }`}
    >
      <svg
        viewBox="0 0 16 16"
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/** A lesson finished today, in finish order: done for today, passed or not. */
async function DoneRow({
  lesson,
  lang,
  level,
}: {
  lesson: LessonCard;
  lang: Language;
  level: Level;
}) {
  const t = await getTranslations('Course');
  const status = await getTranslations('LessonStatus');
  const passed = lesson.status === 'done';
  // A done card always has a score; 0 only keeps the types honest.
  const score = lesson.score ?? 0;

  return (
    <li className="flex gap-3">
      <CheckIcon passed={passed} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <LessonText lesson={lesson} lang={lang} />
          <div className="flex shrink-0 items-center gap-2">
            {lesson.level === level ? null : <span className={BADGE}>{lesson.level}</span>}
            {passed ? (
              <span className="text-sm font-semibold text-slate-100">
                <span className="sr-only">{status('done')}, </span>
                {t('doneScore', { score })}
              </span>
            ) : null}
          </div>
        </div>
        {passed ? null : (
          <p className="text-sm text-amber-300">
            {t('failedRow', { status: status('failed'), score })}
          </p>
        )}
      </div>
    </li>
  );
}

/** A lesson still to do: its number, the text, the time and one button. */
async function LessonRow({
  lesson,
  lang,
  action,
  primary,
}: {
  lesson: LessonCard;
  lang: Language;
  action: 'start' | 'open';
  primary: boolean;
}) {
  const t = await getTranslations('Course');

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="w-6 shrink-0 text-center text-sm font-semibold text-slate-500">
        {lesson.position}
      </span>
      <div className="min-w-0 flex-1 basis-48">
        <LessonText lesson={lesson} lang={lang} />
      </div>
      <div className="ml-9 flex shrink-0 items-center gap-3 sm:ml-0">
        <span className="text-sm text-slate-500">
          {t('lessonMinutes', { minutes: LESSON_MINUTES })}
        </span>
        {/* No prefetch: a row the learner only sees is not a lesson opened. */}
        <Link
          href={lessonPath(lang, lesson.id)}
          prefetch={false}
          className={primary ? PRIMARY_BUTTON : SECONDARY_BUTTON}
        >
          {t(action)}
        </Link>
      </div>
    </li>
  );
}

/**
 * The day's goal: done rows, then proposed ones until the target. Met, it
 * keeps the done rows only. A goal raised after it was met is not met any
 * more, so it shows done over the new target and proposes the rest.
 */
export async function TodayCard({
  today,
  lang,
  level,
  dailyGoal,
}: {
  today: Today;
  lang: Language;
  level: Level;
  dailyGoal: number;
}) {
  const t = await getTranslations('Course');
  const [next, ...rest] = today.met ? [] : today.proposed;

  return (
    <section
      aria-labelledby="today-heading"
      className="flex flex-col gap-5 rounded-2xl border border-slate-800 bg-slate-900 p-6"
    >
      <div className="flex flex-col gap-3">
        <h2 id="today-heading" className={HEADING}>
          {t('today')}
        </h2>
        <p className="text-lg font-semibold text-slate-100">
          {today.met
            ? t('goalReached')
            : t('goalProgress', {
                minutes: dailyGoal,
                done: today.done.length,
                target: today.target,
              })}
        </p>
        <ProgressBar value={today.done.length} max={today.target} label={t('goalBar')} />
      </div>

      {today.done.length > 0 ? (
        <ol className="flex flex-col gap-4">
          {today.done.map((lesson) => (
            <DoneRow key={lesson.id} lesson={lesson} lang={lang} level={level} />
          ))}
        </ol>
      ) : null}

      {next === undefined ? null : (
        <div className="flex flex-col gap-3">
          <span className={`${BADGE} self-start`}>{t('nextUp')}</span>
          <ol className="flex flex-col gap-4">
            <LessonRow lesson={next} lang={lang} action="start" primary />
            {rest.map((lesson) => (
              <LessonRow
                key={lesson.id}
                lesson={lesson}
                lang={lang}
                action="start"
                primary={false}
              />
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

/** Lessons past the day's target. Nothing to show, no section. */
export async function MoreLessons({ lessons, lang }: { lessons: LessonCard[]; lang: Language }) {
  if (lessons.length === 0) {
    return null;
  }
  const t = await getTranslations('Course');

  return (
    <section aria-labelledby="more-heading" className="flex flex-col gap-4">
      <h2 id="more-heading" className={HEADING}>
        {t('moreLessons')}
      </h2>
      <ol className="flex flex-col gap-4">
        {lessons.map((lesson) => (
          <LessonRow key={lesson.id} lesson={lesson} lang={lang} action="open" primary={false} />
        ))}
      </ol>
    </section>
  );
}

/**
 * Shown once every ready lesson of the level is attempted and enough are
 * passed (progress.complete). After C2 there is no next level to start.
 */
export async function LevelComplete({
  today,
  lang,
  level,
}: {
  today: Today;
  lang: Language;
  level: Level;
}) {
  const t = await getTranslations('Course');
  const { progress, levelAfter } = today;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-green-500/40 bg-green-500/5 p-6">
      <p className="text-lg font-semibold text-slate-100">
        {levelAfter === null
          ? t('levelCompleteTop', { level })
          : t('levelComplete', {
              level,
              attempted: progress.attempted,
              total: progress.total,
              passed: progress.passed,
              needed: progress.needed,
            })}
      </p>
      {levelAfter === null ? null : (
        <div className="flex flex-wrap items-center gap-4">
          <StartLevel lang={lang} level={levelAfter} />
          <Link
            href={`/learn/${lang}/placement`}
            className="inline-flex min-h-11 items-center text-sm text-slate-300 underline underline-offset-4 transition-colors hover:text-slate-100"
          >
            {t('takePlacement')}
          </Link>
        </div>
      )}
    </section>
  );
}
