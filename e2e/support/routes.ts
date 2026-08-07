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
  { path: '/api/hello', name: 'api hello' },
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
