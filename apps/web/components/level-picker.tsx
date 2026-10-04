'use client';

import { useId, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { Level } from '@ft/shared';

import { BEGINNER, MASTERY_OPTIONS, nextLevel } from '@/lib/level';

/**
 * Asks what the learner has mastered, A0 to C2, wherever a level is set, so the
 * same pick gives the same course in onboarding, after the exam and on the
 * course page. Undefined is nothing picked yet; null is the beginner.
 */
export function LevelPicker({
  value,
  onChange,
}: {
  value: Level | null | undefined;
  onChange: (mastered: Level | null) => void;
}) {
  const t = useTranslations('Level');
  const name = useId();

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-3 border-0 p-0">
        <legend className="mb-1 text-sm font-medium">{t('legend')}</legend>
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {MASTERY_OPTIONS.map((option) => (
            <label
              key={option ?? BEGINNER}
              className="cursor-pointer rounded-md border border-slate-700 py-3 text-center text-sm has-checked:border-slate-100 has-checked:bg-slate-100 has-checked:text-slate-900 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-slate-100"
            >
              <input
                type="radio"
                name={name}
                value={option ?? BEGINNER}
                checked={value === option}
                onChange={() => onChange(option)}
                className="sr-only"
              />
              {option ?? BEGINNER}
            </label>
          ))}
        </div>
      </fieldset>

      {value === undefined ? null : <LevelSummary mastered={value} />}
    </div>
  );
}

/**
 * What a mastery claim means for the course, as a ladder and a sentence.
 * role="status", so a change is announced and not only repainted.
 */
export function LevelSummary({
  mastered,
  children,
}: {
  mastered: Level | null;
  /** Shown above the ladder, inside the same announcement. */
  children?: ReactNode;
}) {
  const t = useTranslations('Level');
  const target = nextLevel(mastered);

  return (
    <div
      role="status"
      className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6"
    >
      {children}
      <LevelLadder mastered={mastered} target={target} />
      <p className="text-sm text-slate-300">
        {t(`description.${mastered ?? BEGINNER}`)}{' '}
        {target === mastered ? t('lessonsAtTop') : t('lessonsAt', { level: target })}
      </p>
    </div>
  );
}

/** Decorative: the sentence under it says the same thing in words. */
function LevelLadder({ mastered, target }: { mastered: Level | null; target: Level }) {
  const t = useTranslations('Level');

  return (
    <div className="flex items-end justify-between gap-1" aria-hidden>
      {MASTERY_OPTIONS.map((option) => {
        const isCurrent = option === mastered;
        // C2 is both, and then the target mark would hide the current one.
        const isTarget = option === target && !isCurrent;

        return (
          <div key={option ?? BEGINNER} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="h-4 text-[10px] font-medium text-slate-400">
              {isCurrent ? t('ladderYou') : isTarget ? t('ladderGoal') : ''}
            </span>
            <span
              className={`h-1.5 w-full rounded-full ${
                isCurrent
                  ? 'bg-slate-100'
                  : isTarget
                    ? 'bg-linear-to-r from-violet-500 to-blue-500'
                    : 'bg-slate-800'
              }`}
            />
            <span
              className={`text-[11px] ${
                isCurrent || isTarget ? 'font-semibold text-slate-200' : 'text-slate-500'
              }`}
            >
              {option ?? BEGINNER}
            </span>
          </div>
        );
      })}
    </div>
  );
}
