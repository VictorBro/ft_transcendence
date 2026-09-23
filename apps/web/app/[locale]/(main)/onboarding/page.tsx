import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { loadCourses } from '@/lib/courses';
import { resolveOnboardingStep } from '@/lib/onboarding';
import { ChooseCourse } from './choose-course';
import { ChooseLevel } from './choose-level';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Onboarding');

  return { title: t('title') };
}

// Renders one specific person's courses, so it must never be prerendered or cached.
export const dynamic = 'force-dynamic';

/**
 * Where a learner picks what to study, and the entry point for adding a
 * language later. Not under /learn/[lang]: [lang] is what this page chooses.
 */
export default async function OnboardingPage() {
  const result = await loadCourses();

  // This read answers the session question too, so requireUser() would only
  // add a round trip. An unavailable API is not a verdict about the visitor.
  if (result.status === 'signed-out') {
    redirect('/login');
  }

  if (result.status === 'unavailable') {
    throw new Error(`Could not load the courses: ${result.reason}`);
  }

  const step = resolveOnboardingStep(result.data.courses);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-8">
      {step.step === 'chooseCourse' ? (
        <ChooseCourse
          studied={result.data.courses.map((course) => course.lang)}
          activeLang={result.data.activeLang}
        />
      ) : (
        <ChooseLevel course={step.course} />
      )}
    </div>
  );
}
