/** Imports nothing: the middleware and a client component both read this. */

/** The course last opened here. What NEXT_LOCALE is for the interface. */
export const COURSE_COOKIE = 'ft.lang';

/** Anchored on /learn: the locale prefix is a two-letter segment too. */
export function learnPathLang(pathname: string): string | null {
  return /\/learn\/([a-z]{2})(?:\/|$)/.exec(pathname)?.[1] ?? null;
}

/**
 * The course home and nothing under it. Next prefetches the links on a course
 * page, and those sit under /learn/<lang> too, so the looser match would let a
 * link the learner merely saw record itself as the course they opened.
 */
export function courseHomeLang(pathname: string): string | null {
  return /^\/(?:[a-z]{2}\/)?learn\/([a-z]{2})\/?$/.exec(pathname)?.[1] ?? null;
}
