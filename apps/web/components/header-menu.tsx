'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { usePathname } from '@/i18n/navigation';
import { UnreadTotalBadge } from './unread-badge';

/**
 * The signed-in header's switchers and links, folded behind one button below
 * `sm`. A phone had them wrap into four rows above every page. From `sm` the
 * button is hidden and the panel carries the classes the row always had, so
 * the desktop header is unchanged.
 *
 * Returns two siblings rather than a wrapper: below `sm` the button sits on
 * the wordmark's row in Shell's header and the panel takes the full row under
 * it. The unread count rides on the button, so a closed menu still shows it.
 */
export function HeaderMenu({ children }: { children: ReactNode }) {
  const t = useTranslations('SessionNav');
  const pathname = usePathname();
  const panelId = useId();
  const button = useRef<HTMLButtonElement>(null);
  // Open for the page it was opened on: following a link closes it, since the
  // header stays mounted across a navigation.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) {
      setOpenOn(null);
      button.current?.focus();
    }
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpenOn(open ? null : pathname)}
        onKeyDown={onKeyDown}
        className="relative flex size-10 cursor-pointer items-center justify-center rounded-md border border-slate-800 bg-slate-900 text-slate-300 transition-colors hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 sm:hidden"
      >
        <span className="sr-only">{t('menu')}</span>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
        >
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
        <span className="absolute -top-2 -right-2 flex">
          <UnreadTotalBadge />
        </span>
      </button>

      <div
        id={panelId}
        data-header-menu
        onKeyDown={onKeyDown}
        className={`flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 max-sm:basis-full max-sm:flex-col max-sm:items-stretch max-sm:gap-y-3 max-sm:border-t max-sm:border-slate-800 max-sm:pt-4 ${open ? '' : 'max-sm:hidden'}`}
      >
        {children}
      </div>
    </>
  );
}
