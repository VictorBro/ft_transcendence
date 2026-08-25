import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { requireUser } from '@/lib/session';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Lobby' });

  return { title: t('title') };
}

/**
 * The lobby tiles. `href` is the route the tile opens; every one of these is
 * mirrored by a row in e2e/tests/dashboard.spec.ts, so adding a mode here means
 * adding it there too.
 *
 * The wording lives in the Lobby namespace rather than here, because each tile
 * names a page that renders the same title through ComingSoon: one key, two
 * readers, so the tile and its destination cannot drift apart.
 */
export default async function LobbyPage() {
  await requireUser();
  const t = await getTranslations('Lobby');

  const modes = [
    {
      id: 'friends',
      title: t('friendsTitle'),
      description: t('friendsDescription'),
      href: '/friends',
    },
    {
      id: 'chat',
      title: t('chatTitle'),
      description: t('chatDescription'),
      href: '/chat',
    },
    {
      id: 'progress',
      title: t('progressTitle'),
      description: t('progressDescription'),
      href: '/chat-progress',
    },
    {
      id: 'word',
      title: t('wordTitle'),
      description: t('wordDescription'),
      href: '/word-mode',
    },
    {
      id: 'sentence',
      title: t('sentenceTitle'),
      description: t('sentenceDescription'),
      href: '/sentence-mode',
    },
    {
      id: 'roleplay',
      title: t('roleplayTitle'),
      description: t('roleplayDescription'),
      href: '/roleplay',
    },
  ];

  /** Heights of the side panels, which have no content yet. */
  const panelHeights = ['h-60', 'h-44', 'h-40', 'h-44'];

  return (
    <div className="flex h-full min-h-0 gap-6">
      {/* Nothing else on this page is a heading, so without one the lobby has an
          empty outline for a screen reader. sr-only leaves the design as drawn. */}
      <h1 className="sr-only">{t('heading')}</h1>

      <div className="-mx-3 -my-3 flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {modes.map((mode) => (
          <Link
            key={mode.id}
            href={mode.href}
            // Prefetch off: each of the six would server-render the target's
            // layout, and every one of those calls the API for the session.
            prefetch={false}
            // The card is one big link, so its accessible name would otherwise
            // be the title and the description run together, leaving "Chat" and
            // "Chat progress" indistinguishable. labelledby names it after the
            // title alone; describedby keeps the description announced instead
            // of dropping it, which a plain aria-label would have done.
            aria-labelledby={`${mode.id}-title`}
            aria-describedby={`${mode.id}-description`}
            className="flex min-h-44 shrink-0 flex-col rounded-2xl border border-slate-800 bg-slate-900 p-6 transition-transform duration-200 hover:scale-102"
          >
            <p id={`${mode.id}-title`} className="mt-2 text-2xl font-semibold">
              {mode.title}
            </p>
            <p id={`${mode.id}-description`} className="mt-6 max-w-xs text-lg text-slate-400">
              {mode.description}
            </p>
          </Link>
        ))}
      </div>

      {/* Placeholders for panels still to come. Plain divs, not <aside>: nested
          empty landmarks are announced as empty regions. */}
      <aside className="flex w-[460px] shrink-0 flex-col gap-4 overflow-y-auto">
        {panelHeights.map((height, index) => (
          // Index key: the list is a fixed literal, never reordered, and two
          // panels share a height so the class is not unique.
          <div key={index} className={`shrink-0 rounded-2xl border border-slate-800 ${height}`} />
        ))}
      </aside>
    </div>
  );
}
