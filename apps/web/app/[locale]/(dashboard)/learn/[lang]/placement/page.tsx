import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LanguageSchema } from '@ft/shared';

import { findCourse, requireCourses } from '@/lib/courses';
import { apiFind } from '@/lib/api';
import { isPlacementResult, PlacementStateSchema } from '@/lib/placement-schema';
import { PlacementExam } from './placement-exam';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Placement' });
  return { title: t('title') };
}

export default async function PlacementPage({ params }: { params: Promise<{ lang: string }> }) {
  // First, so an anonymous visitor gets /login and not a 404 or onboarding.
  const { courses } = await requireCourses();

  const { lang } = await params;

  const parsed = LanguageSchema.safeParse(lang);
  if (!parsed.success) {
    notFound();
  }

  // Unlike CoursePage, a null level is exactly who this page is for: placement
  // is what sets it. Only a language the learner does not study is sent back to
  // onboarding, where the course gets created.
  const course = findCourse(courses, parsed.data);
  if (course === null) {
    redirect(`/onboarding?lang=${parsed.data}`);
  }

  // A 404 is no run yet: the page offers the start control for it.
  const result = await apiFind(PlacementStateSchema, '/api/placement');

  // The session died between the two reads. A 401 is the one failure where a
  // redirect tells the truth, so it goes to /login like requireCourses.
  if (result.status === 'signed-out') {
    redirect('/login');
  }

  if (result.status === 'unavailable') {
    throw new Error(`Could not load placement: ${result.reason}`);
  }

  const run = result.status === 'ok' ? result.data : null;

  // One run per learner, whatever the language. A live one elsewhere is where
  // the learner belongs; a finished one elsewhere is only a report, which the
  // start control here replaces.
  if (run !== null && run.lang !== parsed.data && !isPlacementResult(run)) {
    redirect(`/learn/${run.lang}/placement`);
  }

  return (
    <PlacementExam
      lang={parsed.data}
      courseLevel={course.level}
      initial={run?.lang === parsed.data ? run : null}
    />
  );
}
