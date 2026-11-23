import { CourseSwitcher } from './course-switcher';
import { HeaderMenu } from './header-menu';
import { LanguageSwitcher } from './language-switcher';
import { SessionNav } from './session-nav';
import { loadCourses } from '@/lib/courses';
import { currentUser } from '@/lib/session';

/**
 * HeaderNav plus the course switcher. Separate because HeaderNav also serves
 * (main), where this would fetch courses for anonymous visitors, and
 * (messages), where no course is open.
 */
export async function DashboardNav() {
  const [user, result] = await Promise.all([currentUser(), loadCourses()]);
  const courses = result.status === 'ok' ? result.data.courses : [];
  const items = (
    <>
      {courses.length > 0 ? <CourseSwitcher courses={courses} /> : null}
      <LanguageSwitcher />
      <SessionNav />
    </>
  );

  return user === null ? (
    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">{items}</div>
  ) : (
    <HeaderMenu>{items}</HeaderMenu>
  );
}
