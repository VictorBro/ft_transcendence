import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LanguageSchema } from '@ft/shared';

import { Link } from '@/i18n/navigation';
import { PracticeRow } from '@/components/mode-tiles';
import { findCourse, loadCourses } from '@/lib/courses';
import { requireUser } from '@/lib/session';
import { GoalPicker } from './goal-picker';

/** Reads the session and the courses on every request. */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Course' });

  return { title: t('title') };
}

export default async function CoursePage({ params }: { params: Promise<{ lang: string }> }) {
  // First, so an anonymous visitor gets /login and not the error boundary.
  await requireUser();

  const { lang } = await params;
  const t = await getTranslations('Course');
  const languageName = await getTranslations('Languages');

  // Not a learnable language is a wrong URL, not a course still to start.
  const parsed = LanguageSchema.safeParse(lang);
  if (!parsed.success) {
    notFound();
  }

  const result = await loadCourses();
  if (result.status === 'signed-out') {
    redirect('/login');
  }
  if (result.status === 'unavailable') {
    // Like requireUser: the error boundary keeps the cookie, a redirect reads
    // as a logout.
    throw new Error(`Could not load the courses: ${result.reason}`);
  }

  const course = findCourse(result.data.courses, parsed.data);

  if (course === null) {
    // Not a 404: the language is real, they just do not study it yet.
    return (
      <div className="flex h-full min-h-0 flex-col gap-6">
        <h1 className="text-3xl font-semibold">{languageName(parsed.data)}</h1>
        <section className="flex flex-col items-start gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-lg text-slate-400">{t('notStudying')}</p>
          <Link
            href="/onboarding"
            className="rounded-md bg-indigo-600 px-4 py-2 font-medium transition-colors hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
          >
            {t('startCourse')}
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 lg:flex-row">
      <div className="-mx-3 -my-3 flex min-w-0 flex-1 flex-col gap-6 px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:overflow-y-auto">
        <h1 className="text-3xl font-semibold">{languageName(course.lang)}</h1>

        {/* The roadmap is the point of this page, so it holds the main column
            even while the Topic catalogue is unseeded. */}
        <div className="flex min-h-60 flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-800 text-slate-500">
          {t('roadmapSoon')}
        </div>

        <section className="flex shrink-0 flex-col gap-3 border-t border-slate-800 pt-5">
          <h2 className="text-xs font-semibold tracking-widest text-slate-500 uppercase">
            {t('practice')}
          </h2>
          <PracticeRow />
        </section>
      </div>

      <aside className="w-full shrink-0 lg:w-95">
        <section className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xs font-semibold tracking-widest text-slate-500 uppercase">
            {t('thisCourse')}
          </h2>

          <p className="flex items-baseline justify-between gap-4 text-sm text-slate-400">
            <span>{t('level')}</span>
            <span className="text-lg font-semibold text-slate-100">
              {course.level ?? t('notPlaced')}
            </span>
          </p>

          <GoalPicker lang={course.lang} dailyGoal={course.dailyGoal} />

          <Link
            href={`/learn/${course.lang}/placement`}
            className="text-sm text-slate-400 underline underline-offset-4 transition-colors hover:text-slate-100"
          >
            {course.level === null ? t('takePlacement') : t('retakePlacement')}
          </Link>
        </section>
      </aside>
    </div>
  );
}
