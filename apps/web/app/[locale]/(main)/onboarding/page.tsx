import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LanguageSchema } from '@ft/shared';

import { requireCourses } from '@/lib/courses';
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
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string | string[] }>;
}) {
  const { courses, activeLang } = await requireCourses();
  // A hand-edited ?lang= is ignored rather than an error.
  const wanted = LanguageSchema.safeParse((await searchParams).lang);
  const step = resolveOnboardingStep(courses, wanted.success ? wanted.data : null);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-8">
      {step.step === 'chooseCourse' ? (
        <ChooseCourse
          // Remounts when ?lang= changes, since the preselection is only a starting value.
          key={step.preselected}
          studied={courses.map((course) => course.lang)}
          activeLang={activeLang}
          preselected={step.preselected}
        />
      ) : (
        <ChooseLevel course={step.course} />
      )}
    </div>
  );
}
