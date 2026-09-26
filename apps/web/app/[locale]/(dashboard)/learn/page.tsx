import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { COURSE_COOKIE } from '@/lib/course-path';
import { landingPath, requireCourses } from '@/lib/courses';

/** Reads the session, the courses and the ft.lang cookie on every request. */
export const dynamic = 'force-dynamic';

/** Where sign-in and the home links go. Renders nothing: it only picks the page. */
export default async function LearnPage() {
  const courses = await requireCourses();
  const cookieLang = (await cookies()).get(COURSE_COOKIE)?.value;

  redirect(landingPath(cookieLang, courses));
}
