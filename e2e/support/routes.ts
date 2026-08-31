/**
 * Single list of what the gates walk. Adding a page means adding it here, and
 * the console gate then covers it automatically.
 */

export interface PageRoute {
  /** Path relative to baseURL. */
  path: string;
  /** Used as the test title, so it reads as a sentence in the report. */
  name: string;
  /** Defaults to 200. Set it where a page is expected to answer otherwise. */
  expectedStatus?: number;
}

/**
 * Rendered HTML pages. Every one of these goes through the console gate.
 *
 * The last two are here because the gate guards a rejection criterion, and both
 * are surfaces an evaluator actually opens: /api/docs is printed by `make` and
 * is third-party Swagger UI whose console output is not ours, and the 404 page
 * is rendered by Next but was previously only checked over HTTP, so nothing
 * watched its console.
 */
export const PAGE_ROUTES: PageRoute[] = [
  { path: '/', name: 'home' },
  { path: '/privacy', name: 'privacy policy' },
  { path: '/terms', name: 'terms of service' },
  { path: '/api/docs', name: 'api docs' },
  { path: '/this-route-does-not-exist', name: 'not found', expectedStatus: 404 },
];

/** JSON endpoints, checked with the request context rather than a browser. */
export const JSON_ROUTES: PageRoute[] = [
  { path: '/healthz', name: 'web healthcheck' },
  { path: '/api/health', name: 'api healthcheck' },
];

/**
 * Subject rejection criterion: the legal pages must exist and carry real text.
 * Mirrors LEGAL_MINIMUM_CHARACTERS in apps/web/lib/legal.ts, which a unit test
 * already asserts on the source data. This is the same floor measured on the
 * rendered page, so a routing or layout regression cannot hide behind a passing
 * unit test.
 */
export const LEGAL_MINIMUM_CHARACTERS = 1500;

export const LEGAL_ROUTES: PageRoute[] = [
  { path: '/privacy', name: 'privacy policy' },
  { path: '/terms', name: 'terms of service' },
];

/**
 * Every page that must expose the legal links, split by whether reaching it
 * needs a session. The (main) shell carries the full footer and the (dashboard)
 * and (mode) shells the compact LegalFooter, but all three publish the links
 * under the same "Legal" nav, so one assertion covers each list.
 *
 * These exist because the footer was previously only checked on "/", which let
 * the (dashboard) and (mode) shells ship with no footer at all while the test
 * titled "every page" stayed green.
 */
export const PUBLIC_FOOTER_ROUTES: PageRoute[] = [
  { path: '/', name: 'home' },
  // The 404 renders in the root layout, not a route group's, so it is the one
  // page that can lose the footer without any group layout changing. That is
  // exactly how it lost it before, unnoticed.
  { path: '/this-route-does-not-exist', name: 'not found', expectedStatus: 404 },
  { path: '/privacy', name: 'privacy policy' },
  { path: '/terms', name: 'terms of service' },
  { path: '/login', name: 'login' },
  { path: '/signup', name: 'signup' },
];

/** Same, for the routes behind requireUser(). */
export const AUTHENTICATED_FOOTER_ROUTES: PageRoute[] = [
  { path: '/dashboard', name: 'dashboard' },
  { path: '/chat', name: 'chat' },
  { path: '/chat-progress', name: 'chat progress' },
  { path: '/word-mode', name: 'word mode' },
  { path: '/sentence-mode', name: 'sentence mode' },
  { path: '/roleplay', name: 'roleplay' },
  { path: '/friends', name: 'friends' },
  { path: '/profile', name: 'profile' },
  { path: '/settings/2fa', name: 'two-factor settings' },
];
