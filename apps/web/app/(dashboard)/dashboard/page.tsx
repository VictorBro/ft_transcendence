import type { Metadata } from 'next';
import Link from 'next/link';

import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Lobby' };

/**
 * The lobby tiles. `href` is the route the tile opens; every one of these is
 * mirrored by a row in e2e/tests/dashboard.spec.ts, so adding a mode here means
 * adding it there too.
 */
const modes = [
  {
    id: 'friends',
    title: 'Discuss with a friend',
    description:
      'Chat in real time with a friend in any language. We translate and correct for both of you.',
    href: '/friends',
  },
  {
    id: 'chat',
    title: 'Chat',
    description: 'Boost your language skills by practicing with our AI-powered tutor.',
    href: '/chat',
  },
  {
    id: 'progress',
    title: 'Chat progress',
    description:
      'Follow a conversation path that adapts to your progress, from beginner to advanced.',
    href: '/chat-progress',
  },
  {
    id: 'word',
    title: 'Word mode',
    description: 'Build your core vocabulary using our word lists.',
    href: '/word-mode',
  },
  {
    id: 'sentence',
    title: 'Sentence mode',
    description: 'Build your language skills from the ground up.',
    href: '/sentence-mode',
  },
  {
    id: 'roleplay',
    title: 'Roleplay',
    description: 'Practice with useful real-life scenarios.',
    href: '/roleplay',
  },
];

/** Heights of the side panels, which have no content yet. */
const panelHeights = ['h-60', 'h-44', 'h-40', 'h-44'];

export default async function LobbyPage() {
  await requireUser();

  return (
    <div className="flex h-full min-h-0 gap-6">
      {/* Nothing else on this page is a heading, so without one the lobby has an
          empty outline for a screen reader. sr-only leaves the design as drawn. */}
      <h1 className="sr-only">Practice modes</h1>

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
