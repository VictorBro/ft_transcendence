import Link from 'next/link';

import { requireUser } from '@/lib/session';

const modes = [
  {
    id: 'friends',
    title: 'Discuss with a friend',
    description:
      'Chat in real time with a friend in any language — we translate and correct for both of you.',
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

const panels = [
  {
    id: 'panel-1',
    height: 'h-60',
  },
  {
    id: 'panel-2',
    height: 'h-48',
  },
  {
    id: 'panel-3',
    height: 'h-44',
  },
  {
    id: 'panel-4',
    height: 'h-44',
  },
];

export default async function LobbyPage() {
  await requireUser();

  return (
    <div className="flex h-full gap-6">
      <div className="flex flex-1 min-w-0 flex-col gap-4 overflow-visible">
        {modes.map((mode) => (
          <Link
            key={mode.id}
            href={mode.href}
            aria-label={mode.title}
            className="flex min-h-44 flex-col rounded-2xl border border-slate-200 bg-slate-900 p-6 transition-transform duration-200 hover:scale-102 dark:border-slate-800"
          >
            <p className="font-semibold text-2xl mt-2">{mode.title}</p>
            <p className="text-lg mt-6 max-w-xs text-slate-400">{mode.description}</p>
          </Link>
        ))}
      </div>

      <aside className="flex w-[460px] shrink-0 flex-col gap-4 sticky self-start top-6">
        {panels.map((panel) => (
          <aside
            key={panel.id}
            className={`flex flex-col items-center justify-center rounded-2xl border border-slate-200 p-4 text-center dark:border-slate-800 ${panel.height}`}
          ></aside>
        ))}
      </aside>
    </div>
  );
}
