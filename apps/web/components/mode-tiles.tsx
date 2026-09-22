import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';

/**
 * Shared by /dashboard and the course home so the two cannot drift. Every tile
 * is mirrored by a row in e2e/tests/dashboard.spec.ts. The hrefs stay top-level
 * until #52 moves the mode routes under the course.
 */
async function modes() {
  const t = await getTranslations('Lobby');

  // The two the product has: the tutor (PRODUCT_ARCHITECTURE 1.4) and
  // cross-language chat (1.5). The four that were here named nothing in any plan.
  return [
    { id: 'chat', title: t('chatTitle'), description: t('chatDescription'), href: '/chat' },
    {
      id: 'friends',
      title: t('friendsTitle'),
      description: t('friendsDescription'),
      href: '/friends',
    },
  ];
}

export async function ModeTiles() {
  return (
    <>
      {(await modes()).map((mode) => (
        <Link
          key={mode.id}
          href={mode.href}
          // Off: each of the six would server-render a layout that calls the API.
          prefetch={false}
          // One big link, so its name would be title and description run
          // together, leaving "Chat" and "Chat progress" indistinguishable.
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
    </>
  );
}

/**
 * The same modes, demoted. Five of the six are ComingSoon stubs, so on the
 * course page they sit under the roadmap rather than standing in for it.
 */
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
