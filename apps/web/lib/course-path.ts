/** Imports nothing: the middleware and a client component both read this. */

/** The course last opened here. What NEXT_LOCALE is for the interface. */
export const COURSE_COOKIE = 'ft.lang';

/** Anchored on /learn: the locale prefix is a two-letter segment too. */
export function learnPathLang(pathname: string): string | null {
  return /\/learn\/([a-z]{2})(?:\/|$)/.exec(pathname)?.[1] ?? null;
}
