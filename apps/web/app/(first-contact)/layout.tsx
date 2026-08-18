import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

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
    <html lang="en" suppressHydrationWarning className="dark">
      <body className="flex min-h-dvh flex-col bg-slate-950 font-sans text-slate-100 antialiased">
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center pb-36 px-6 py-12">
          {children}
        </main>
      </body>
    </html>
  );
}
