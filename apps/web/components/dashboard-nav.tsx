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
    <div className="flex items-center gap-4">
      {courses.length > 0 ? <CourseSwitcher courses={courses} /> : null}
      <LanguageSwitcher />
      <SessionNav />
    </div>
  );
}
