'use client';

import { useTranslations } from 'next-intl';
import type { Course } from '@ft/shared';

import { usePathname, useRouter } from '@/i18n/navigation';
import { learnPathLang } from '@/lib/course-path';

/** Not a language code, so it cannot collide with a course. */
const ADD_LANGUAGE = '__add';

/**
 * What the learner studies, beside the locale switcher for what the interface
 * says. Named "Course": i18n.spec.ts matches the locale one by name without
 * `exact`, so a second combobox saying "Language" breaks it.
 */
export function CourseSwitcher({ courses }: { courses: Course[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('CourseSwitcher');
  const languageName = useTranslations('Languages');

  // From the URL: a layout does not re-render on navigation within it. A value
  // matching no option would make the browser show the first instead.
  const path = learnPathLang(pathname);
  const current = courses.some((course) => course.lang === path) ? path : null;

  function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;

    router.push(value === ADD_LANGUAGE ? '/onboarding' : `/learn/${value}`);
  }

  return (
    <label className="flex items-center text-sm text-slate-400">
      <span className="mr-2 hidden sm:inline">{t('label')}</span>
      <select
        value={current ?? ''}
        onChange={onChange}
        className="cursor-pointer rounded-md border border-slate-800 bg-slate-900 py-1 pr-7 pl-2 text-slate-300 transition-colors hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
      >
        {/* On /dashboard nothing is open, so there has to be a value to show. */}
        {current === null ? (
          <option value="" disabled>
            {t('none')}
          </option>
        ) : null}
        {courses.map((course) => (
          <option key={course.lang} value={course.lang}>
            {languageName(course.lang)}
          </option>
        ))}
        <option value={ADD_LANGUAGE}>{t('addLanguage')}</option>
      </select>
    </label>
  );
}
