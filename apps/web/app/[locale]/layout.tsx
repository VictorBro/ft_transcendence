import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';

import { routing } from '@/i18n/routing';

import '../globals.css';

/**
 * The root layout, and deliberately inside [locale] rather than above it.
 *
 * `lang` has to name the language actually rendered, or a screen reader
 * pronounces French with English phonemes. Reaching the locale from an
 * app/layout.tsx one level up would mean next/root-params, and root params only
 * exist when the root layout itself sits behind the dynamic segment — an
 * app/layout.tsx above this one produces none, and the generated module comes
 * back empty. Owning the document here makes the segment an ordinary param and
 * costs no experimental flag.
 *
 * Everything the three shells share and none of them vary lives here: the
 * document, the metadata, the one stylesheet. Each route group keeps its own
 * layout for what it renders — (main) a logo header over a full footer,
 * (dashboard) the same header over the compact one, (mode) a close button
 * instead — and carries its own height rule on a wrapper, since <body> lives
 * here and cannot be `min-h-dvh` and `h-dvh` at once.
 *
 * `messages` is handed to the provider whole, which is what ships every string
 * in the catalogue to the browser. That is the reason the legal documents are
 * NOT in it — see lib/legal-content.
 */

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Layout' });

  // A proper noun, so the three catalogues carry the same string. It still
  // comes from a catalogue: the module is graded on no user-facing text being
  // hardcoded, not on every string differing between languages.
  const productName = t('productName');

  return {
    title: {
      default: productName,
      template: `%s | ${productName}`,
    },
    description: t('description'),
    applicationName: productName,
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // A URL like /es/login matches this segment before anything else can reject
  // it. Without this the render would continue with an unknown locale and
  // next-intl would answer every key with its own path.
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    // Extensions like Dark Reader stamp attributes on <html> before React
    // hydrates, which otherwise logs a mismatch an evaluator would read as a
    // console gate failure. This covers that one element, not its children, so
    // a real mismatch anywhere inside still reports.
    <html lang={locale} suppressHydrationWarning className="dark">
      <body className="bg-slate-950 font-sans text-slate-100 antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
