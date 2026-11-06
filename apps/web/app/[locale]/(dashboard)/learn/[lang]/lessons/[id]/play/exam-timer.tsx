'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import { useTranslations } from 'next-intl';

/** m:ss */
function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * The "Time left" box of an exam page. It counts down to a deadline in
 * this tab's clock (the time the page arrived plus the server's
 * remainingMs), not a count of ticks: a hidden tab gets its timers
 * throttled. At zero it calls onZero once, which posts the drafts. A
 * page that arrived already at zero (ranOut) never calls it: the learner
 * reads the note first.
 */
export function ExamTimer({
  deadline,
  ranOut,
  onZero,
  limitS,
}: {
  deadline: number;
  ranOut: boolean;
  onZero: () => void;
  limitS: number;
}) {
  const t = useTranslations('Lesson');
  const left = () => Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  const [seconds, setSeconds] = useState(left);
  const zero = useEffectEvent(onZero);

  useEffect(() => {
    if (ranOut) return;
    const interval = setInterval(() => {
      const now = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSeconds(now);
      if (now === 0) {
        clearInterval(interval);
        zero();
      }
    }, 250);
    return () => clearInterval(interval);
  }, [deadline, ranOut]);

  const urgent = seconds <= 10;
  return (
    <div
      role="timer"
      aria-label={t('timeLeft')}
      className={`lesson-countdown grid gap-1 rounded-xl border px-4 py-3 ${
        urgent ? 'border-red-500/60 bg-red-500/10' : 'border-slate-800 bg-slate-900'
      }`}
    >
      <span className="text-sm text-slate-400">{t('timeLeft')}</span>
      <span
        data-testid="time-left"
        className={`text-2xl font-semibold tabular-nums ${urgent ? 'text-red-300' : 'text-slate-100'}`}
      >
        {clock(seconds)}
      </span>
      <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <span
          className={`block h-full rounded-full ${urgent ? 'bg-red-400' : 'bg-cyan-300'}`}
          style={{ width: `${Math.min(100, (seconds / limitS) * 100)}%` }}
        />
      </span>
    </div>
  );
}
