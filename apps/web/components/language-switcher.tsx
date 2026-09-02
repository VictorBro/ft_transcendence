'use client';

import { usePathname, Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { SUPPORTED_LOCALES } from '@ft/shared';

export function LanguageSwitcher() {
  const pathname = usePathname();
  const t = useTranslations('LanguageSwitcher');

  return (
    // Named like the other two landmarks: three <nav>s with one unlabelled is
    // what a screen reader reads as "navigation" three times over.
    <nav aria-label={t('label')} className="flex items-center gap-2 text-sm text-slate-400">
      {SUPPORTED_LOCALES.map((loc) => (
        <Link key={loc} href={pathname} locale={loc} className="hover:text-slate-100">
          {loc}
        </Link>
      ))}
    </nav>
  );
}
