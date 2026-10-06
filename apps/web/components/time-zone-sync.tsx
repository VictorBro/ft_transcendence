'use client';

import { useEffect, useRef } from 'react';

import { usePathname, useRouter } from '@/i18n/navigation';
import { updateProfile } from '@/lib/auth-client';

/**
 * Stores the browser's time zone when it differs from the saved one, so the
 * server can work out the learner's day. Renders nothing.
 *
 * The zone is sent exactly as the browser reports it: a normalised copy (ICU
 * turns Europe/Kyiv into Europe/Kiev) would never compare equal, and every
 * page would send another PATCH.
 */
export function TimeZoneSync({ storedTimeZone }: { storedTimeZone: string }) {
  const router = useRouter();
  // Read only as a trigger: the layout stays mounted from page to page, so
  // without it a failed PATCH would wait for a full reload.
  const pathname = usePathname();
  // A page change while a PATCH is pending would otherwise send a second one.
  const inFlight = useRef(false);
  // A 400 rejects the zone itself: the browser reports the same one on every
  // page, so retrying waits for the next mount.
  const rejected = useRef(false);

  useEffect(() => {
    // Older browsers may not resolve a zone: there is nothing to send then.
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timeZone || timeZone === storedTimeZone || inFlight.current || rejected.current) {
      return;
    }

    inFlight.current = true;
    // A failure needs no message: the next page tries again, unless it was a 400.
    void updateProfile({ timeZone }).then((result) => {
      inFlight.current = false;
      if (result.ok) {
        router.refresh();
      } else if (result.status === 400) {
        rejected.current = true;
      }
    });
  }, [storedTimeZone, router, pathname]);

  return null;
}
