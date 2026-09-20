import createMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';

import { routing } from '@/i18n/routing';
import { COURSE_COOKIE, learnPathLang } from '@/lib/course-path';

const intl = createMiddleware(routing);

/**
 * next-intl's middleware, plus the cookie /dashboard reads to know where to
 * land. Written here because a server component cannot set one during a render.
 */
export default function proxy(request: NextRequest) {
  const response = intl(request);
  const lang = learnPathLang(request.nextUrl.pathname);

  if (lang !== null) {
    response.cookies.set(COURSE_COOKIE, lang, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return response;
}

export const config = {
  // Match all pathnames except for
  // - … if they start with `/api`, `/trpc`, `/_next` or `/_vercel`
  // - … the ones containing a dot (e.g. `favicon.ico`)
  // Exclude /healthz: it's a machine health-check endpoint (used by Docker and
  // e2e smoke tests), not a user-facing page. It has no locale-prefixed version,
  // so letting the middleware redirect it would 404 and mark the container unhealthy.
  matcher: '/((?!api|trpc|_next|_vercel|healthz|.*\\..*).*)',
};
