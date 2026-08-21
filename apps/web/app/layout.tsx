import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

/**
 * Everything the three shells share and none of them vary: the document, the
 * metadata and the one stylesheet. Each route group keeps its own layout for
 * what it actually renders — (main) a logo header over a full footer, (dashboard)
 * the same header over the compact one, (mode) a close button instead — and
 * carries its own height rule on a wrapper, since <body> lives here now and
 * cannot be `min-h-dvh` and `h-dvh` at once.
 */

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
      <body className="bg-slate-950 font-sans text-slate-100 antialiased">{children}</body>
    </html>
  );
}
