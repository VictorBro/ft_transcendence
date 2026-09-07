'use client';

import './globals.css';

/**
 * The only boundary above [locale], and deliberately English.
 *
 * [locale]/error.tsx catches everything that throws while rendering a page, and
 * it is translated. What reaches this one is what throws in the layout that
 * loads the catalogue, so asking for a translation here would fail a second
 * time, inside an error boundary, and React would fall back to its own bare
 * message.
 *
 * global-error replaces the document rather than rendering inside it, which is
 * why it carries its own <html> and <body>: the layout that normally provides
 * them is exactly what failed. That also rules out Shell and the footers, all
 * of which read translations.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 font-sans text-slate-100 antialiased">
        <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Something went wrong</h1>
          <p className="max-w-md text-slate-400">
            We could not reach the service. You are still signed in, and this is usually over in a
            moment.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-2 rounded-full bg-indigo-700 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-800"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
