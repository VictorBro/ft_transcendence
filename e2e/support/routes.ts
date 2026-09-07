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
// Pinned to /en: the suite exercises one known language deterministically
// rather than relying on Accept-Language negotiation picking the same default
// locale on every runner. /api/docs and the not-found probe stay unprefixed for
// two different reasons: the former never reaches Next at all, Caddy routes it
// straight to NestJS; the latter is left bare on purpose, so that walking it
// also proves the middleware prefixes an unknown URL before [locale]/[...rest]
// answers 404.
export const PAGE_ROUTES: PageRoute[] = [
  { path: '/en', name: 'home' },
  { path: '/en/privacy', name: 'privacy policy' },
  { path: '/en/terms', name: 'terms of service' },
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
  { path: '/en/privacy', name: 'privacy policy' },
  { path: '/en/terms', name: 'terms of service' },
];

/**
 * Every page that must expose the legal links, split by whether reaching it
 * needs a session. The (main) shell carries the full footer and the (dashboard)
 * and (mode) shells the compact LegalFooter, but all three label that nav from
 * the same Footer.legalNav key, so one assertion covers each list. These routes
 * are pinned to /en, so the value read is the English one.
 *
 * These exist because the footer was previously only checked on "/", which let
 * the (dashboard) and (mode) shells ship with no footer at all while the test
 * titled "every page" stayed green.
 */
// Prefixed like the lists above, and for the same reason: an unprefixed path
// only reaches the page through a middleware redirect, so a broken href would
// still land somewhere green and the assertion would prove nothing about the
// locale the reader is actually in.
export const PUBLIC_FOOTER_ROUTES: PageRoute[] = [
  { path: '/en', name: 'home' },
  // The 404 is the one page whose footer depends on the catch-all under
  // [locale] resolving: lose that and Next answers with the bare page it ships,
  // which has no footer at all. It lost its footer once already, unnoticed.
  { path: '/en/this-route-does-not-exist', name: 'not found', expectedStatus: 404 },
  { path: '/en/privacy', name: 'privacy policy' },
  { path: '/en/terms', name: 'terms of service' },
  { path: '/en/login', name: 'login' },
  { path: '/en/signup', name: 'signup' },
];

/** Same, for the routes behind requireUser(). */
export const AUTHENTICATED_FOOTER_ROUTES: PageRoute[] = [
  { path: '/en/dashboard', name: 'dashboard' },
  { path: '/en/chat', name: 'chat' },
  { path: '/en/chat-progress', name: 'chat progress' },
  { path: '/en/word-mode', name: 'word mode' },
  { path: '/en/sentence-mode', name: 'sentence mode' },
  { path: '/en/roleplay', name: 'roleplay' },
  { path: '/en/friends', name: 'friends' },
  { path: '/en/profile', name: 'profile' },
  { path: '/en/settings/2fa', name: 'two-factor settings' },
];
