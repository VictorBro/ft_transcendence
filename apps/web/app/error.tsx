'use client';

import Link from 'next/link';

import { LegalFooter } from '@/components/legal-footer';
import { Shell, Wordmark } from '@/components/shell';

/**
 * Where requireUser() lands when the API cannot be reached.
 *
 * That throw is deliberate: a rate-limited or restarting API must not look like
 * a logout, so the session cookie is left alone and the visitor can simply try
 * again. Without this boundary Next answers with its own unstyled 500, which
 * has no nav and no way back, trading a wrong redirect for a dead end.
 *
 * No account nav here: the session lookup is precisely what failed.
 */
export default function ErrorBoundary({ reset }: { error: Error; reset: () => void }) {
  return (
    <Shell brand={<Wordmark />} footer={<LegalFooter />}>
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="max-w-md text-slate-400">
          We could not reach the service. You are still signed in, and this is usually over in a
          moment.
        </p>
        <div className="mt-2 flex items-center gap-4 text-sm">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-indigo-700 px-6 py-2 font-semibold text-white transition-colors hover:bg-indigo-800"
          >
            Try again
          </button>
          <Link href="/" className="underline underline-offset-4 hover:text-slate-100">
            Go home
          </Link>
        </div>
      </div>
    </Shell>
  );
}
