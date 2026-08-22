import Link from 'next/link';

/**
 * Minimal footer for the app shells. The (main) marketing shell keeps its own
 * larger footer; here the chat and mode pages need the legal links reachable
 * without spending vertical space the conversation view wants.
 */

export function LegalFooter() {
  return (
    <footer className="shrink-0 px-6 pb-4 pt-0 text-center text-[11px] text-slate-500">
      <nav aria-label="Legal">
        An academic project. Not a commercial service. Checkout our{' '}
        <Link href="/privacy" className="underline underline-offset-4 hover:text-slate-300">
          Privacy Policy
        </Link>{' '}
        and{' '}
        <Link href="/terms" className="underline underline-offset-4 hover:text-slate-300">
          Terms of Service
        </Link>
        .
      </nav>
    </footer>
  );
}
