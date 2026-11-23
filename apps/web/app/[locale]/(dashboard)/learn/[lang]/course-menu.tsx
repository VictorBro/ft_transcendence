'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';

import { usePathname } from '@/i18n/navigation';
import { useScrollLock } from '@/components/scroll-lock';
import { COURSE_MENU_SLOT } from '@/lib/course-menu-slot';

/**
 * The course page's side column: the settings, the rank, the challenge, the
 * stats and the placement test. From `lg` it is the column right of the
 * lessons, unchanged. Below `lg` the page is one column and these cards would
 * sit under every lesson, so they fold behind a "My course" button that takes
 * the wordmark's place in the header, and open over the page like the account
 * menu does.
 *
 * The button is portalled into the header slot. Until it mounts the wordmark
 * shows: Wordmark hides itself below `lg` only while this button exists.
 */
export function CourseMenu({ className, children }: { className: string; children: ReactNode }) {
  const t = useTranslations('Course');
  const pathname = usePathname();
  const panelId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // Open for the page it was opened on, as the account menu: a link closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  useScrollLock(open);

  useEffect(() => {
    setSlot(document.getElementById(COURSE_MENU_SLOT));
  }, []);

  // A click outside or Escape closes it.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!button.current?.contains(target) && !panel.current?.contains(target)) setOpenOn(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpenOn(null);
      button.current?.focus();
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <>
      {slot === null
        ? null
        : createPortal(
            <button
              ref={button}
              type="button"
              data-course-menu-button
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpenOn(open ? null : pathname)}
              className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm font-medium text-slate-200 transition-colors hover:border-slate-700 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 lg:hidden"
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="size-[18px] text-indigo-300"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
              >
                <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
              </svg>
              {t('myCourse')}
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className={`size-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>,
            slot,
          )}

      {open ? <div aria-hidden className="fixed inset-0 z-40 bg-slate-950/75 lg:hidden" /> : null}

      <aside
        ref={panel}
        id={panelId}
        className={`${className} ${open ? '' : 'max-lg:hidden'} max-lg:fixed max-lg:top-16 max-lg:z-50 max-lg:mx-0 max-lg:my-0 max-lg:max-h-[calc(100dvh-5rem)] max-lg:overflow-y-auto max-lg:rounded-2xl max-lg:border max-lg:border-slate-800 max-lg:bg-slate-950 max-lg:p-3 max-lg:shadow-2xl max-lg:shadow-black/50 max-sm:inset-x-4 sm:max-lg:left-6 sm:max-lg:w-[26rem]`}
      >
        {children}
      </aside>
    </>
  );
}
