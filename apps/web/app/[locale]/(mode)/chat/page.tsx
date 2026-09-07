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
    <div className="flex h-full min-h-0 gap-6">
      {/*
        The heading is visually redundant next to the "Tutor" label, but without
        one this page has an empty heading outline and a screen reader lands
        nowhere. sr-only keeps the design as drawn.
      */}
      <h1 className="sr-only">{t('heading')}</h1>

      <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-slate-800">
        <header className="flex items-center gap-3 border-b border-slate-800 px-5 py-4">
          <span className="font-semibold">{t('tutor')}</span>
        </header>

        {/* The scrolling pane. The shell gives it a bounded box; see Shell. */}
        <div className="flex-1 overflow-y-auto p-4">{/* message list */}</div>

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

      <aside className="flex w-[460px] shrink-0 flex-col items-center justify-center overflow-y-auto rounded-2xl border border-slate-800 p-4 text-center">
        <p className="font-semibold">{t('feedbackHeading')}</p>
        <p className="mt-2 text-sm text-slate-400">{t('feedbackIntro')}</p>
      </aside>
    </div>
  );
}
