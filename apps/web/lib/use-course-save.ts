'use client';

import { useState } from 'react';

import { useRouter } from '@/i18n/navigation';
import type { ApiResult } from '@/lib/api-client';
import { useErrorMessage } from '@/lib/error-message';

/**
 * The one way a course setting on the course page is saved: the write, its
 * error in the interface language, then router.refresh() so the server
 * renders the page for the new setting. GoalPicker, DirectLevelPicker and
 * StartLevel share it, so they stay in step.
 *
 * `save` answers whether the write went through, so a caller holding the
 * picked value can fall back to the stored one when it did not.
 */
export function useCourseSave() {
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(write: () => Promise<ApiResult<unknown>>): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      const result = await write();
      if (!result.ok) {
        setError(errorMessage(result.code, result.status));
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setPending(false);
    }
  }

  return { pending, error, save };
}
