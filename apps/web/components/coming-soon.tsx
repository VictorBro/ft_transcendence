import { useTranslations } from 'next-intl';

/**
 * Placeholder for a lobby tile whose feature does not exist yet. The title is
 * passed in rather than derived from the route so the page and the tile that
 * links to it cannot drift apart: both read the same Lobby key.
 */
export function ComingSoon({ title }: { title: string }) {
  const t = useTranslations('ComingSoon');

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-4xl font-semibold sm:text-6xl">{title}</p>
      <p className="max-w-sm text-lg text-slate-400 sm:text-2xl">{t('stillInDevelopment')}</p>
    </div>
  );
}
