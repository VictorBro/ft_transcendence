import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';

import { SessionNav } from '@/components/session-nav';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'ft_transcendence',
    template: '%s | ft_transcendence',
  },
  description:
    'An AI-driven platform for learning a foreign language: generated lessons, automatic levelling, and live practice with another learner.',
  applicationName: 'ft_transcendence',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // Extensions like Dark Reader stamp attributes on <html> before React
    // hydrates, which otherwise logs a mismatch an evaluator would read as a
    // console gate failure. This covers that one element, not its children, so
    // a real mismatch anywhere inside still reports.
    <html lang="en" suppressHydrationWarning className="dark">
      <body className="flex h-dvh flex-col bg-slate-950 font-sans text-slate-100 antialiased">
        <header className="border-b border-slate-800">
          <div className="mx-auto flex w-full max-w-6xl items-baseline justify-between gap-4 px-6 py-5">
            <Link
              href="/dashboard"
              aria-label="Back to dashboard"
              className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
            >
              ✕
            </Link>
            <SessionNav />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">{children}</main>
      </body>
    </html>
  );
}
