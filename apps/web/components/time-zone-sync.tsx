'use client';

import { useEffect } from 'react';

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

  useEffect(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timeZone === storedTimeZone) {
      return;
    }

    // A failure needs no message: the next page tries again.
    void updateProfile({ timeZone }).then((result) => {
      if (result.ok) {
        router.refresh();
      }
    });
  }, [storedTimeZone, router, pathname]);

  return null;
}
