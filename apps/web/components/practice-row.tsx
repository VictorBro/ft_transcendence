import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';

/** The hrefs stay top-level until the mode routes move under the course. */
async function modes() {
  const t = await getTranslations('Modes');

  // The two the product has: the tutor (PRODUCT_ARCHITECTURE 1.4) and
  // cross-language chat (1.5). The four that were here named nothing in any plan.
  return [
    { id: 'chat', title: t('chatTitle'), href: '/chat' },
    { id: 'friends', title: t('friendsTitle'), href: '/friends' },
  ];
}

/** Placeholders for now, so they sit under the roadmap rather than standing in for it. */
export async function PracticeRow() {
  return (
    <div className="flex flex-wrap gap-2">
      {(await modes()).map((mode) => (
        <Link
          key={mode.id}
          href={mode.href}
          prefetch={false}
          className="rounded-full border border-slate-800 bg-slate-900 px-4 py-1.5 text-sm text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-100"
        >
          {mode.title}
        </Link>
      ))}
    </div>
  );
}
