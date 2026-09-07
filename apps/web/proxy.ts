import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Match all pathnames except for
  // - … if they start with `/api`, `/trpc`, `/_next` or `/_vercel`
  // - … the ones containing a dot (e.g. `favicon.ico`)
  // Exclude /healthz: it's a machine health-check endpoint (used by Docker and
  // e2e smoke tests), not a user-facing page — it has no locale-prefixed version,
  // so letting the middleware redirect it would 404 and mark the container unhealthy.
  matcher: '/((?!api|trpc|_next|_vercel|healthz|.*\\..*).*)',
};
