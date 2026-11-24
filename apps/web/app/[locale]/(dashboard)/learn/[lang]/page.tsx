import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LanguageSchema, SERVER_EVENTS } from '@ft/shared';

import { Link } from '@/i18n/navigation';
import { ChallengeCard, NewToday, RankLine } from '@/components/gamification';
import { CourseMenu } from './course-menu';
import { RefreshOn } from '@/components/refresh-on';
import { findCourse, requireCourses } from '@/lib/courses';
import { loadToday } from '@/lib/lessons';
import { DirectLevelPicker } from './direct-level-picker';
import { GoalPicker } from './goal-picker';
import { LevelComplete, MoreLessons, StreakLine, TodayCard } from './today';

/** Reads the session and the courses on every request. */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; lang: string }>;
}): Promise<Metadata> {
  const { locale, lang } = await params;
  // No notFound() here: it could race the page's /login redirect. The page 404s.
  const parsed = LanguageSchema.safeParse(lang);
  if (!parsed.success) {
    return {};
  }

  const t = await getTranslations({ locale, namespace: 'Course' });
  const languageName = await getTranslations({ locale, namespace: 'Languages' });

  // en reads the name, fr and de pick a whole phrase by code: "Cours d'anglais".
  return { title: t('title', { language: languageName(parsed.data), lang: parsed.data }) };
}

export default async function CoursePage({ params }: { params: Promise<{ lang: string }> }) {
  // First, so an anonymous visitor gets /login and not a 404 or onboarding.
  const { courses } = await requireCourses();

  const { lang } = await params;
  const t = await getTranslations('Course');
  const languageName = await getTranslations('Languages');

  // Not a learnable language is a wrong URL, not a course still to start.
  const parsed = LanguageSchema.safeParse(lang);
  if (!parsed.success) {
    notFound();
  }

  // Only this page, not a layout: placement below it must stay reachable.
  const course = findCourse(courses, parsed.data);
  if (course === null || course.level === null) {
    redirect(`/onboarding?lang=${parsed.data}`);
  }

  // Once, after the guard: a course that cannot open never asks for its day.
  const today = await loadToday(course.lang);
  if (today === 'signed-out') {
    redirect('/login');
  }

  const { progress } = today;
  // No ready lesson in the level: nothing to propose, so no goal to reach.
  const empty = progress.total === 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 lg:flex-row">
      {/* Any course's change, not only this one's: the switcher lists them all. */}
      <RefreshOn events={[SERVER_EVENTS.COURSE_UPDATED]} />
      <div className="relative -mx-3 -my-3 flex min-w-0 flex-1 flex-col gap-6 px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:overflow-y-auto">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold">{languageName(course.lang)}</h1>
          {/* The streak is the course's, so it shows on a level with nothing to play too. */}
          <StreakLine streak={today.streak} />
        </div>
        <NewToday codes={today.earnedToday} lang={course.lang} />

        {empty ? (
          <p className="rounded-2xl border border-dashed border-slate-800 p-6 text-slate-400">
            {t('noReadyLessons')}
          </p>
        ) : (
          <>
            {progress.complete ? (
              <LevelComplete today={today} lang={course.lang} level={course.level} />
            ) : null}
            <TodayCard
              today={today}
              lang={course.lang}
              level={course.level}
              dailyGoal={course.dailyGoal}
            />
            <MoreLessons lessons={today.extra} lang={course.lang} />
            {/* Every row of the level, ready or not: the list shows them all. */}
            <Link
              href={`/learn/${course.lang}/lessons`}
              prefetch={false}
              className="inline-flex min-h-11 items-center self-start text-sm text-slate-300 underline underline-offset-4 transition-colors hover:text-slate-100"
            >
              {t('seeAll', { count: progress.total + progress.comingSoon, level: course.level })}
            </Link>
          </>
        )}
      </div>

      {/* The cards: the settings, the rank, the challenge, where the level stands, and the
        placement test. From lg they grow to fill the column down to the footer;
        a screen too short for them scrolls the column instead. Below lg they
        fold behind the header's My course button. */}
      <CourseMenu className="relative -mx-3 -my-3 flex w-auto shrink-0 flex-col gap-3 px-3 py-3 [scrollbar-width:none] lg:w-101 lg:overflow-y-auto [&::-webkit-scrollbar]:hidden">
        <section className="flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-900 p-5 lg:flex-1 lg:justify-center">
          <h2 className="text-xs font-semibold tracking-widest text-slate-500 uppercase">
            {t('thisCourse')}
          </h2>

          {/* Both are course settings, so the level changes here, next to the goal. */}
          <DirectLevelPicker lang={course.lang} level={course.level} />
          <GoalPicker lang={course.lang} dailyGoal={course.dailyGoal} />
        </section>

        {/* The course's XP, under the settings, so it shows on a level with
          nothing to play too. */}
        <section
          aria-labelledby="rank-heading"
          className="flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-900 p-5 lg:flex-1 lg:justify-center lg:[&_[data-slot=rank]>a]:min-h-0 lg:[&_[data-slot=rank]>a]:pt-1"
        >
          <h2
            id="rank-heading"
            className="text-xs font-semibold tracking-widest text-slate-500 uppercase"
          >
            {t('rankTitle')}
          </h2>
          <RankLine xp={today.xp} lang={course.lang} />
        </section>
        {/* The day's challenge, under the rank. With nothing ready to play,
          none can be done. */}
        {empty ? null : <ChallengeCard challenge={today.challenge} lang={course.lang} />}

        {/* One stat per row, its number in bold, behind an icon that tells them apart. */}
        <ul className="flex flex-col divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-900 px-5 py-1 text-sm text-slate-400 lg:flex-[1.6]">
          {empty ? null : (
            <>
              <StatRow icon="attempted">
                {t.rich('attempted', {
                  attempted: progress.attempted,
                  total: progress.total,
                  b: strong,
                })}
              </StatRow>
              <StatRow icon="passed">
                {t.rich('passed', {
                  passed: progress.passed,
                  total: progress.total,
                  needed: progress.needed,
                  b: strong,
                })}
              </StatRow>
            </>
          )}
          {progress.comingSoon > 0 ? (
            <StatRow icon="comingSoon">
              {t.rich('comingSoon', { count: progress.comingSoon, b: strong })}
            </StatRow>
          ) : null}
          <StatRow icon="streak">
            {t.rich('bestStreak', { count: today.streak.best, b: strong })}
          </StatRow>
        </ul>

        {/* The whole card is the link. */}
        <Link
          href={`/learn/${course.lang}/placement`}
          className="group flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900 px-5 py-4 text-sm text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-800/60 hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
        >
          {t('takePlacement')}
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-5 shrink-0 text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-300"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </CourseMenu>
    </div>
  );
}

/** A stat's number, set apart from the words around it. */
const strong = (chunks: ReactNode) => (
  <strong className="font-semibold text-slate-100 tabular-nums">{chunks}</strong>
);

const STAT_ICONS = {
  attempted: {
    color: 'text-indigo-300',
    path: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />,
  },
  passed: {
    color: 'text-emerald-300',
    path: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 12.5l2.5 2.5 4.5-5" />,
  },
  comingSoon: {
    color: 'text-slate-400',
    path: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" />,
  },
  streak: {
    color: 'text-amber-300',
    path: (
      <path d="M12 21c-3.9 0-7-2.8-7-6.5 0-2.6 1.6-4.4 3-5.8.4 1.6 1.3 2.6 2.5 3.1C10.2 8.6 12 5.5 14 3c.6 2.6 2.1 4.3 3.4 6 .9 1.2 1.6 2.6 1.6 4.5 0 4.1-3.1 7.5-7 7.5z" />
    ),
  },
};

function StatRow({ icon, children }: { icon: keyof typeof STAT_ICONS; children: ReactNode }) {
  const { color, path } = STAT_ICONS[icon];
  return (
    <li className="flex items-center gap-3 py-1.5 lg:flex-1">
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-lg bg-slate-800/80 ${color}`}
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {path}
        </svg>
      </span>
      <span>{children}</span>
    </li>
  );
}
