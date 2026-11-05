'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';

import { usePathname, useRouter } from '@/i18n/navigation';
import { connectSocket, useSocketStatus } from './tab-socket';

/**
 * Rendered by SessionNav for a signed-in user only: opens the tab's connection,
 * and says so while it is being restored. Never closes it on unmount: moving
 * between route groups remounts SessionNav, and the socket must ride through.
 */
export function ConnectionStatus() {
  const status = useSocketStatus();
  const router = useRouter();
  const t = useTranslations('Connection');
  // Read only as a trigger, like TimeZoneSync: the header stays mounted within
  // a route group, so a refused socket gets another try on the next page.
  const pathname = usePathname();
  // A page that mounts after a refusal was just rendered for a signed-in user:
  // only a refusal seen while mounted calls for a refresh.
  const previous = useRef(status);

  useEffect(() => connectSocket(), [pathname]);

  // The server refused this session: a guarded page then redirects to /login,
  // so a sign-out in another tab shows up here.
  useEffect(() => {
    if (status === 'signedOut' && previous.current !== 'signedOut') router.refresh();
    previous.current = status;
  }, [status, router]);

  return (
    // aria-live without role="status": announced when the pill appears, and the
    // course page keeps a single status role. Fixed, so the header never reflows.
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    >
      {status === 'reconnecting' ? (
        // Opaque, since it floats over the page.
        <span className="rounded-full border border-amber-500/40 bg-slate-900 px-4 py-1.5 text-sm text-amber-300 shadow-lg">
          {t('reconnecting')}
        </span>
      ) : null}
    </div>
  );
}
