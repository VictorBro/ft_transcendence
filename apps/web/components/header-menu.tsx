'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { usePathname } from '@/i18n/navigation';
import { useScrollLock } from './scroll-lock';
import { UnreadTotalBadge } from './unread-badge';

/**
 * The signed-in header's switchers and links, folded behind one button so the
 * header is the wordmark and that button on every screen. Open, the panel lies
 * over the page under the header, right-aligned with the button, and a dark
 * backdrop covers the page behind it.
 *
 * Shell's header row is `relative z-50`: the panel is placed against it, and
 * the backdrop, at -z-10 inside that stacking context, dims the page while the
 * wordmark and this button stay lit above it.
 *
 * Closed, the panel is `invisible` rather than display:none. SessionNav renders
 * the fixed "Reconnecting…" pill inside it, which opts back in with `visible`.
 * For the same reason the panel takes no transform or filter: either would make
 * it the containing block of that fixed pill.
 */
export function HeaderMenu({ children }: { children: ReactNode }) {
  const t = useTranslations('SessionNav');
  const pathname = usePathname();
  const panelId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // Open for the page it was opened on: following a link closes it, since the
  // header stays mounted across a navigation.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  useScrollLock(open);

  // A click anywhere else, the backdrop included, closes it.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!button.current?.contains(target) && !panel.current?.contains(target)) setOpenOn(null);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) {
      setOpenOn(null);
      button.current?.focus();
    }
  }

  return (
    <>
      <div
        aria-hidden
        className={`fixed inset-0 -z-10 bg-slate-950/75 transition-opacity duration-200 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />

      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpenOn(open ? null : pathname)}
        onKeyDown={onKeyDown}
        className="relative flex size-9 cursor-pointer items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 transition-colors hover:border-slate-700 hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
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
        ref={panel}
        id={panelId}
        data-header-menu
        onKeyDown={onKeyDown}
        className={`${open ? '' : 'invisible'} absolute top-full right-4 left-4 mt-2 flex flex-col gap-1 rounded-2xl border border-slate-800 bg-slate-900 p-2 shadow-2xl shadow-black/50 sm:right-6 sm:left-auto sm:w-80`}
      >
        {children}
      </div>
    </>
  );
}
