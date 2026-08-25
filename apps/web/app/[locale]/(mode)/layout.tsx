import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

import { LanguageSwitcher } from '@/components/language-switcher';
import { LegalFooter } from '@/components/legal-footer';
import { SessionNav } from '@/components/session-nav';
import { Shell } from '@/components/shell';
import { Link } from '@/i18n/navigation';

/**
 * The practice shell: the same pinned frame as (dashboard), but the wordmark is
 * replaced by a close button, since a mode is something you leave rather than
 * navigate away from.
 */
export default async function ModeLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('ModeLayout');

  return (
    <Shell
      brand={
        <Link
          href="/dashboard"
          aria-label={t('backToDashboard')}
          className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
        >
          ✕
        </Link>
      }
      nav={
        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          <SessionNav />
        </div>
      }
      fill
      footer={<LegalFooter />}
    >
      {children}
    </Shell>
  );
}
