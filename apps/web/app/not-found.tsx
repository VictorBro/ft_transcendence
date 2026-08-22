import Link from 'next/link';

import { LegalFooter } from '@/components/legal-footer';
import { Shell, Wordmark } from '@/components/shell';

/**
 * Next renders this inside the root layout, so it gets none of the route
 * groups' chrome and has to bring its own. Without it an unmatched URL answered
 * with a bare document: no header, no landmark, and none of the legal links the
 * subject requires to be reachable from wherever the reader is.
 *
 * No account nav: this is rendered for unmatched paths and must not read
 * cookies, which would make every 404 a dynamic render.
 */
export default function NotFound() {
  return (
    <Shell brand={<Wordmark />} footer={<LegalFooter />}>
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
        <p className="max-w-md text-slate-400">
          That address does not exist. It may have moved, or the link that brought you here may be
          out of date.
        </p>
        <Link
          href="/"
          className="mt-2 rounded-full bg-indigo-700 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-800"
        >
          Go home
        </Link>
      </div>
    </Shell>
  );
}
