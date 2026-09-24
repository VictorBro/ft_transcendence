import { CourseSwitcher } from './course-switcher';
import { LanguageSwitcher } from './language-switcher';
import { SessionNav } from './session-nav';
import { loadCourses } from '@/lib/courses';

/**
 * HeaderNav plus the course switcher. Separate because HeaderNav also serves
 * (main) and (mode), where this would fetch courses for anonymous visitors.
 */
export async function DashboardNav() {
  const result = await loadCourses();
  const courses = result.status === 'ok' ? result.data.courses : [];

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
      {courses.length > 0 ? <CourseSwitcher courses={courses} /> : null}
      <LanguageSwitcher />
      <SessionNav />
    </div>
  );
}
