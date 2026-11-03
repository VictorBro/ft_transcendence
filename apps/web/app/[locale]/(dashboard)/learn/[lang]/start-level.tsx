'use client';

import { useTranslations } from 'next-intl';
import type { Language, Level } from '@ft/shared';

import { setCourseLevel } from '@/lib/courses-client';
import { useCourseSave } from '@/lib/use-course-save';
import { FormError, PRIMARY_BUTTON } from '@/components/form';

/** "Start A2" on the level complete card: the same write as the level picker. */
export function StartLevel({ lang, level }: { lang: Language; level: Level }) {
  const t = useTranslations('Course');
  const { pending, error, save } = useCourseSave();

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => save(() => setCourseLevel(lang, { level }))}
        disabled={pending}
        className={PRIMARY_BUTTON}
      >
        {t('startLevel', { level })}
      </button>
      <FormError message={error} />
    </div>
  );
}
