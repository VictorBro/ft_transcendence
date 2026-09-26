import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { requireUser } from '@/lib/session';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ChatPage' });

  return { title: t('title') };
}

// requireUser() reads the session cookie, so this page is never prerendered.
export const dynamic = 'force-dynamic';

export default async function ChatPage() {
  await requireUser();
  const t = await getTranslations('ChatPage');

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 lg:flex-row">
      {/*
        The heading is visually redundant next to the "Tutor" label, but without
        one this page has an empty heading outline and a screen reader lands
        nowhere. sr-only keeps the design as drawn.
      */}
      <h1 className="sr-only">{t('heading')}</h1>

      <section className="flex min-h-96 min-w-0 flex-1 flex-col rounded-2xl border border-slate-800 lg:min-h-0">
        <header className="flex items-center gap-3 border-b border-slate-800 px-5 py-4">
          <span className="font-semibold">{t('tutor')}</span>
        </header>

        {/* The scrolling pane, from `lg`: that is where the shell bounds it. Below,
            the page scrolls and this grows with the list. See Shell. */}
        <div className="flex-1 p-4 lg:overflow-y-auto">{/* message list */}</div>

        <div className="border-t border-slate-800 p-4">
          <div className="flex items-center gap-3">
            <input
              type="text"
              name="message"
              aria-label={t('messageLabel')}
              placeholder={t('messagePlaceholder')}
              className="flex-1 rounded-full border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold outline-none"
            />
            <button
              type="button"
              aria-label={t('sendMessage')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-700 font-semibold text-slate-100"
            >
              →
            </button>
          </div>
        </div>
      </section>

      <aside className="flex w-full shrink-0 flex-col items-center justify-center rounded-2xl border border-slate-800 p-4 text-center lg:w-115 lg:overflow-y-auto">
        <p className="font-semibold">{t('feedbackHeading')}</p>
        <p className="mt-2 text-sm text-slate-400">{t('feedbackIntro')}</p>
      </aside>
    </div>
  );
}
