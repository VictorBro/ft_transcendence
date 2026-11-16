'use client';

import { useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { LEVELS, type Language, type Level } from '@ft/shared';

import { setCourseLevel } from '@/lib/courses-client';
import { useCourseSave } from '@/lib/use-course-save';
import { FormError } from '@/components/form';

/**
 * The level as a course setting, next to the goal. It names the level the
 * course teaches, A1 to C2, where LevelPicker asks what the learner has
 * mastered. Progress in the old level stays: only the proposal follows.
 *
 * Unlike GoalPicker it saves with a button. On a closed select every arrow key
 * fires `change`, so saving on change would rewrite the course at each level a
 * keyboard user looks at. The button shows only once the pick differs, and
 * the select is never disabled, so the focus stays where it is.
 */
export function DirectLevelPicker({ lang, level }: { lang: Language; level: Level }) {
  const t = useTranslations('Course');
  const { pending, error, save } = useCourseSave();
  const [value, setValue] = useState(level);
  const [saved, setSaved] = useState<Level | null>(null);
  const selectId = useId();

  // A new level from the server (after a refresh, or Start A2) is the pick.
  useEffect(() => setValue(level), [level]);

  async function onSave() {
    if (pending) {
      return;
    }
    const next = value;
    if (await save(() => setCourseLevel(lang, { level: next }))) {
      setSaved(next);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
        <label htmlFor={selectId}>{t('level')}</label>
        <select
          id={selectId}
          value={value}
          onChange={(event) => setValue(event.target.value as Level)}
          className="cursor-pointer rounded-md border border-slate-800 bg-slate-900 py-1 pr-7 pl-2 text-slate-300 transition-colors hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
        >
          {LEVELS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {value === level ? null : (
          <button
            type="button"
            onClick={onSave}
            aria-disabled={pending}
            className="cursor-pointer rounded-md border border-slate-700 px-3 py-1 font-medium text-slate-200 transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 aria-disabled:opacity-60"
          >
            {t('saveLevel')}
          </button>
        )}
      </div>
      {/* Announces the save, since the page re-renders without moving the focus. */}
      <p role="status" className="sr-only">
        {saved === null ? '' : t('levelSaved', { level: saved })}
      </p>
      <FormError message={error} />
    </div>
  );
}
