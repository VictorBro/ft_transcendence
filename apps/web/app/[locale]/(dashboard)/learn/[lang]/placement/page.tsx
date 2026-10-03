import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LanguageSchema } from '@ft/shared';

import { findCourse, requireCourses } from '@/lib/courses';
import { loadPlacement } from '@/lib/placement';
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
  if (findCourse(courses, parsed.data) === null) {
    redirect(`/onboarding?lang=${parsed.data}`);
  }

  const result = await loadPlacement();

  // The session died between the two reads. A 401 is the one failure where a
  // redirect tells the truth, so it goes to /login like requireCourses.
  if (result.status === 'signed-out') {
    redirect('/login');
  }

  if (result.status === 'unavailable') {
    throw new Error(`Could not load placement: ${result.reason}`);
  }

  return <PlacementExam lang={parsed.data} initial={result.status === 'ok' ? result.data : null} />;
}
