'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Language, Level } from '@ft/shared';

import { useRouter } from '@/i18n/navigation';
import { setCourseLevel } from '@/lib/courses-client';
import { useErrorMessage } from '@/lib/error-message';
import { FormError, PRIMARY_BUTTON } from '@/components/form';

/** "Start A2" on the level complete card: the same write as the level picker. */
export function StartLevel({ lang, level }: { lang: Language; level: Level }) {
  const router = useRouter();
  const t = useTranslations('Course');
  const errorMessage = useErrorMessage();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setPending(true);
    setError(null);
    try {
      const result = await setCourseLevel(lang, { level });
      if (!result.ok) {
        setError(errorMessage(result.code, result.status));
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={onClick} disabled={pending} className={PRIMARY_BUTTON}>
        {t('startLevel', { level })}
      </button>
      <FormError message={error} />
    </div>
  );
}
