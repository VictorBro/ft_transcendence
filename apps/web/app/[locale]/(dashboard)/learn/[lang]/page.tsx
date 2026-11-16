import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LanguageSchema, SERVER_EVENTS } from '@ft/shared';

import { Link } from '@/i18n/navigation';
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

      <aside className="w-full shrink-0 lg:w-95">
        <section className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xs font-semibold tracking-widest text-slate-500 uppercase">
            {t('thisCourse')}
          </h2>

          {/* Both are course settings, so the level changes here, next to the goal. */}
          <DirectLevelPicker lang={course.lang} level={course.level} />
          <GoalPicker lang={course.lang} dailyGoal={course.dailyGoal} />

          <ul className="flex flex-col gap-1 text-sm text-slate-400">
            {empty ? null : (
              <>
                <li>{t('attempted', { attempted: progress.attempted, total: progress.total })}</li>
                <li>
                  {t('passed', {
                    passed: progress.passed,
                    total: progress.total,
                    needed: progress.needed,
                  })}
                </li>
              </>
            )}
            {progress.comingSoon > 0 ? (
              <li>{t('comingSoon', { count: progress.comingSoon })}</li>
            ) : null}
            <li>{t('bestStreak', { count: today.streak.best })}</li>
          </ul>

          <Link
            href={`/learn/${course.lang}/placement`}
            className="inline-flex min-h-11 items-center self-start text-sm text-slate-400 underline underline-offset-4 transition-colors hover:text-slate-100"
          >
            {t('takePlacement')}
          </Link>
        </section>
      </aside>
    </div>
  );
}
