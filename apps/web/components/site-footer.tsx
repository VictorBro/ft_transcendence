import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';

/**
 * The full footer, for shells that can afford the vertical space. The app
 * shells use LegalFooter instead; both label their nav from the same
 * Footer.legalNav key, so one assertion covers whichever rendered — "Legal" in
 * English, and the reader's own word everywhere else.
 *
 * Rendered only inside [locale]: global-error.tsx replaces the whole document
 * and carries its own markup, because it answers when the layout that loads the
 * catalogue is itself what failed.
 */
export function SiteFooter() {
  const t = useTranslations('Footer');

  const legalLinks = [
    { href: '/privacy', label: t('privacyPolicy') },
    { href: '/terms', label: t('termsOfService') },
  ];

  return (
    <footer className="border-t border-slate-800">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-6 text-sm text-slate-400">
        <p>{t('academicProject')}</p>
        <nav aria-label={t('legalNav')}>
          <ul className="flex gap-6">
            {legalLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="underline underline-offset-4 hover:text-slate-100"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
