'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Countdown } from '@/components/lesson/countdown';

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

  return <Countdown label={t('timeLeft')} seconds={seconds} total={limitS} testId="time-left" />;
}
