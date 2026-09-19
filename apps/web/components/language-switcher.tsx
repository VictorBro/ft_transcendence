'use client';

import { useLocale, useTranslations } from 'next-intl';
import { SUPPORTED_LOCALES } from '@ft/shared';

import { usePathname, useRouter } from '@/i18n/navigation';

/**
 * A native <select>: keyboard support, screen reader announcement and the
 * mobile picker come free, and it shows the current language. A custom dropdown
 * would be markup and focus handling for the same result.
 *
 * Nothing links to the other locales now. Crawlers still find them: the
 * next-intl middleware in proxy.ts sends one hreflang Link header per route.
 */
export function LanguageSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('LanguageSwitcher');

  return (
    <label className="flex items-center text-sm text-slate-400">
      <span className="mr-2 hidden sm:inline">{t('label')}</span>
      <select
        value={locale}
        // replace, not push: back should not undo a language change.
        onChange={(event) => router.replace(pathname, { locale: event.target.value })}
        className="cursor-pointer rounded-md border border-slate-800 bg-slate-900 py-1 pr-7 pl-2 text-slate-300 transition-colors hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
      >
        {SUPPORTED_LOCALES.map((option) => (
          <option key={option} value={option}>
            {t(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
