'use client';

import { useTranslations } from 'next-intl';
import { type Level } from '@ft/shared';

import { BEGINNER, MASTERY_OPTIONS, nextLevel } from '@/lib/onboarding';

/**
 * Where the learner stands and where the course is taking them. Decorative:
 * the tile under it says the same thing in words.
 */
export function LevelLadder({ level }: { level: Level | null }) {
  const t = useTranslations('Onboarding');
  const target = nextLevel(level);

  return (
    <div className="flex items-end justify-between gap-1" aria-hidden>
      {MASTERY_OPTIONS.map((option) => {
        const isCurrent = option === level;
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
