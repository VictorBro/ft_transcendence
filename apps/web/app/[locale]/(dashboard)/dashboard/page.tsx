import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ModeTiles } from '@/components/mode-tiles';
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

export default async function LobbyPage() {
  await requireUser();
  const t = await getTranslations('Lobby');

  /** Heights of the side panels, which have no content yet. */
  const panelHeights = ['h-60', 'h-44', 'h-40', 'h-44'];

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 lg:flex-row">
      {/* Nothing else on this page is a heading, so without one the lobby has an
          empty outline for a screen reader. sr-only leaves the design as drawn. */}
      <h1 className="sr-only">{t('heading')}</h1>

      <div className="-mx-3 -my-3 flex min-w-0 flex-1 flex-col gap-4 px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:overflow-y-auto">
        <ModeTiles />
      </div>

      {/* Placeholders for panels still to come. Plain divs, not <aside>: nested
          empty landmarks are announced as empty regions. Hidden below `lg`,
          where empty boxes would be all a phone shows under the tiles. */}
      <aside className="hidden w-115 shrink-0 flex-col gap-4 overflow-y-auto lg:flex">
        {panelHeights.map((height, index) => (
          // Index key: the list is a fixed literal, never reordered, and two
          // panels share a height so the class is not unique.
          <div key={index} className={`shrink-0 rounded-2xl border border-slate-800 ${height}`} />
        ))}
      </aside>
    </div>
  );
}
