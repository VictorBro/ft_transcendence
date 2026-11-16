import type { HTMLAttributes } from 'react';

import { cn } from '../lib/cn';

export interface ProgressBarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  value: number;
  max: number;
  /** The accessible name, since the bar has no visible text of its own. */
  label: string;
}

/** Share of max, from 0 to 100. A value past max stops at full, and an empty max reads as empty. */
export function progressPercent(value: number, max: number): number {
  if (max <= 0) {
    return 0;
  }
  return Math.round((Math.min(Math.max(value, 0), max) / max) * 100);
}

// No 'use client', like Card: no handlers and no state, so the bar renders on
// the server and a page without JavaScript still shows it.
export function ProgressBar({ value, max, label, className, ...props }: ProgressBarProps) {
  const shown = Math.min(Math.max(value, 0), Math.max(max, 0));
  const percent = progressPercent(value, max);

  return (
    // The props first, so a caller cannot override the role or the aria values.
    <div
      {...props}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.max(max, 0)}
      aria-valuenow={shown}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-slate-800', className)}
    >
      <div
        className="h-full rounded-full bg-indigo-500 transition-[width]"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
