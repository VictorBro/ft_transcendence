import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LanguageSchema, LessonQuerySchema } from '@ft/shared';

import { Link } from '@/i18n/navigation';
import { findCourse, requireCourses } from '@/lib/courses';
import { loadLessonPage } from '@/lib/lessons';
import {
  ActiveFilters,
  LessonFilters,
  LessonPager,
  LessonRows,
  LessonToolbar,
} from './lesson-list';
import { LiveForm } from './live-form';

/** Reads the session, the courses and the learner's results on every request. */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Lessons' });
  return { title: t('metaTitle') };
}

/**
 * Every lesson of the current level (#87): a plain GET form over
 * GET /api/courses/:lang/lessons, so every view is a URL, and back, refresh
 * and a page without JavaScript all work.
 */
export default async function LessonsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // First, so an anonymous visitor gets /login and not a 404 or onboarding.
  const { courses } = await requireCourses();

  const { lang } = await params;
  const parsed = LanguageSchema.safeParse(lang);
  if (!parsed.success) {
    notFound();
  }

  // #52 guards the course home only, not the pages below it.
  const course = findCourse(courses, parsed.data);
  if (course === null || course.level === null) {
    redirect(`/onboarding?lang=${parsed.data}`);
  }

  // Every field falls back to its default, so a hand-edited URL shows the
  // default view, and the form shows what the API applies.
  const query = LessonQuerySchema.parse(await searchParams);
  const page = await loadLessonPage(course.lang, query);
  if (page === 'signed-out') {
    redirect('/login');
  }
  // The page really shown: past the end, the API gives the last one.
  const shown = { ...query, page: page.page };
  const t = await getTranslations('Lessons');

  return (
    // The dashboard shell is pinned to the viewport from lg: this pane owns the scroll, as on the course home.
    <div className="relative -mx-3 -my-3 min-h-0 flex-1 px-3 py-3 scrollbar-none [&::-webkit-scrollbar]:hidden lg:overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-3xl font-semibold">{t('heading', { level: course.level })}</h1>
          <Link
            href={`/learn/${course.lang}`}
            className="inline-flex min-h-11 items-center text-sm text-slate-400 underline underline-offset-4 transition-colors hover:text-slate-100"
          >
            {t('changeLevel')}
          </Link>
        </div>

        {/* One form around both columns: the filters beside, the toolbar above the rows. */}
        <LiveForm
          lang={course.lang}
          className="group flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10"
        >
          <LessonFilters query={shown} />
          <section aria-label={t('results')} className="flex min-w-0 flex-1 flex-col gap-4">
            <LessonToolbar query={shown} total={page.total} />
            <ActiveFilters lang={course.lang} query={shown} />
            {page.total === 0 ? (
              <div className="flex flex-col items-start gap-2 rounded-2xl border border-dashed border-slate-800 p-6">
                <p className="font-medium text-slate-100">{t('empty')}</p>
                <p className="text-sm text-slate-400">{t('emptyHint')}</p>
              </div>
            ) : (
              <>
                <LessonRows page={page} lang={course.lang} group={query.group} />
                <LessonPager page={page} lang={course.lang} query={shown} />
              </>
            )}
          </section>
        </LiveForm>
      </div>
    </div>
  );
}
