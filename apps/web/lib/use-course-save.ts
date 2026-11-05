'use client';

import { useRef, useState, useTransition } from 'react';

import { useRouter } from '@/i18n/navigation';
import type { ApiResult } from '@/lib/api-client';
import { useErrorMessage } from '@/lib/error-message';
import { serialQueue } from '@/lib/serial-queue';

/**
 * The one way a course setting on the course page is saved: the write, its
 * error in the interface language, then router.refresh() so the server
 * renders the page for the new setting. GoalPicker, DirectLevelPicker and
 * StartLevel share it, so they stay in step.
 *
 * Writes run one after another, so quick changes reach the server in order.
 * `pending` stays true until the refresh has rendered the new setting, so a
 * button cannot send the same save twice in between.
 *
 * `save` answers whether the write went through, so a caller holding the
 * picked value can fall back to the stored one when it did not.
 */
export function useCourseSave() {
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const [run] = useState(serialQueue);
  const inFlight = useRef(0);
  const [writing, setWriting] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function save(write: () => Promise<ApiResult<unknown>>): Promise<boolean> {
    inFlight.current += 1;
    setWriting(true);
    setError(null);
    try {
      const result = await run(write);
      if (!result.ok) {
        setError(errorMessage(result.code, result.status));
        return false;
      }
      setError(null);
      startRefresh(() => router.refresh());
      return true;
    } finally {
      inFlight.current -= 1;
      if (inFlight.current === 0) {
        setWriting(false);
      }
    }
  }

  return { pending: writing || refreshing, error, save };
}
