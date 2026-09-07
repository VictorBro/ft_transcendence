import { useTranslations } from 'next-intl';

/**
 * Placeholder for a lobby tile whose feature does not exist yet. The title is
 * passed in rather than derived from the route so the page and the tile that
 * links to it cannot drift apart — both read the same Lobby key.
 */
export function ComingSoon({ title }: { title: string }) {
  const t = useTranslations('ComingSoon');

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-6xl font-semibold">{title}</p>
      <p className="max-w-sm text-2xl text-slate-400">{t('stillInDevelopment')}</p>
    </div>
  );
}
