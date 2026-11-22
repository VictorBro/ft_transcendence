'use client';

import { useEffect, useRef } from 'react';
import { useLocale } from 'next-intl';

import { usePathname } from '@/i18n/navigation';
import { updateProfile } from '@/lib/auth-client';

/**
 * Stores the interface language when it differs from the saved one, so the
 * server can answer in it: the lesson tutor reads it. Renders nothing.
 *
 * TimeZoneSync's pattern without its router.refresh(): no page renders
 * User.locale, so there is nothing to re-render. The last locale stored is
 * kept here instead, or every page would send the PATCH again.
 */
export function LocaleSync({ storedLocale }: { storedLocale: string }) {
  const locale = useLocale();
  // Read only as a trigger: the layout stays mounted from page to page, so
  // without it a failed PATCH would wait for a full reload.
  const pathname = usePathname();
  const stored = useRef(storedLocale);
  // A page change while a PATCH is pending would otherwise send a second one.
  const inFlight = useRef(false);
  // A 400 rejects the locale itself: the same one comes on every page, so
  // retrying waits for the next mount.
  const rejected = useRef(false);

  useEffect(() => {
    if (locale === stored.current || inFlight.current || rejected.current) {
      return;
    }

    inFlight.current = true;
    // A failure needs no message: the next page tries again, unless it was a 400.
    void updateProfile({ locale }).then((result) => {
      inFlight.current = false;
      if (result.ok) {
        stored.current = result.data.locale;
      } else if (result.status === 400) {
        rejected.current = true;
      }
    });
  }, [locale, pathname]);

  return null;
}
