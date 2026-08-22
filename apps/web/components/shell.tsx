import type { ReactNode } from 'react';
import Link from 'next/link';

/**
 * The frame every page renders in. The three route groups differ in four ways
 * and no more: what sits left of the account nav, what the footer is, whether
 * the shell is pinned to the viewport, and the page itself. All four are props,
 * so the header markup, the gutter and the max width live here once.
 *
 * Deliberately free of data fetching: `nav` is passed in rather than rendering
 * SessionNav directly, which keeps this usable from error.tsx (a client
 * boundary) and from a 404 that must not read cookies.
 */

const CONTAINER = 'mx-auto w-full max-w-6xl px-6';

export interface ShellProps {
  /** Left of the account nav: the wordmark, or a close button on a mode page. */
  brand: ReactNode;
  /** Right of it. Omitted where there is no session to report. */
  nav?: ReactNode;
  /**
   * Pins the shell to the viewport height instead of letting it grow. Use it
   * for app screens whose panes scroll internally; leave it off for documents
   * that run past the fold and want the footer scrolled to.
   */
  fill?: boolean;
  footer: ReactNode;
  children: ReactNode;
}

export function Shell({ brand, nav, fill = false, footer, children }: ShellProps) {
  return (
    <div className={`flex flex-col ${fill ? 'h-dvh' : 'min-h-dvh'}`}>
      <header className="border-b border-slate-800">
        <div className={`${CONTAINER} flex items-baseline justify-between gap-4 py-5`}>
          {brand}
          {nav}
        </div>
      </header>

      {/*
        `min-h-0` is what makes `fill` work. A flex child defaults to
        min-height:auto, which refuses to shrink below its content, so a tall
        page pushes the footer off the screen and any overflow-y-auto inside
        never gets a box to scroll in. Setting it here means a page can size
        itself to the pane with h-full and own its own scrolling.
      */}
      <main className={`${CONTAINER} flex-1 ${fill ? 'min-h-0 pt-8 pb-4' : 'py-12'}`}>
        {children}
      </main>

      {footer}
    </div>
  );
}

/** The wordmark, which doubles as the link home. */
export function Wordmark() {
  return (
    <Link href="/" className="text-base font-semibold tracking-tight text-slate-100">
      ft_transcendence
    </Link>
  );
}
