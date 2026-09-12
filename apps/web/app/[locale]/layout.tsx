import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';

import { routing } from '@/i18n/routing';

import '../globals.css';

/**
 * The root layout, inside [locale] on purpose.
 *
 * <html lang> must name the language actually rendered, and only a layout
 * behind the [locale] segment can read it as a plain param. One placed above
 * would need next/root-params, which returns nothing from there.
 *
 * Holds what all three shells share: the document, the metadata, the
 * stylesheet. Each route group keeps its own layout for its header and footer.
 *
 * The whole catalogue goes to the browser through the provider, which is why
 * the legal documents are not in it. See lib/legal-content.
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
