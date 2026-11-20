import { clock } from '@/lib/clock';

/**
 * A countdown box: its label, the time left as m:ss, and a bar. The exam
 * pages (ExamTimer) and the skim page (#148) draw it; each counts on its
 * own and passes the whole seconds left.
 *
 * The time itself is the timer, named with the label and the time ("Time
 * left: 0:45"), so a screen reader that reads the name hears how long is
 * left; the visible label is hidden from it, or it would be read twice.
 * A timer is not a live region: nothing is announced every second.
 *
 * The last ten seconds are red, as on the screens (.countdown-low).
 */
export function Countdown({
  label,
  seconds,
  total,
  testId,
  className = '',
  calm = 'border-slate-800 bg-slate-900',
}: {
  label: string;
  seconds: number;
  /** The whole countdown, in seconds: the bar is full at the start. */
  total: number;
  testId: string;
  className?: string;
  /** The box's colours while time is not short. */
  calm?: string;
}) {
  const urgent = seconds <= 10;
  return (
    <div
      className={`lesson-countdown grid gap-1 rounded-xl border px-4 py-3 ${
        urgent ? 'border-red-500/60 bg-red-500/10' : calm
      } ${className}`}
    >
      <span aria-hidden="true" className="text-sm text-slate-400">
        {label}
      </span>
      <span
        role="timer"
        aria-label={`${label}: ${clock(seconds)}`}
        data-testid={testId}
        data-urgent={urgent || undefined}
        className={`text-2xl font-semibold tabular-nums ${urgent ? 'text-red-300' : 'text-slate-100'}`}
      >
        {clock(seconds)}
      </span>
      <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <span
          className={`block h-full rounded-full ${urgent ? 'bg-red-400' : 'bg-cyan-300'}`}
          style={{ width: `${Math.min(100, total > 0 ? (seconds / total) * 100 : 0)}%` }}
        />
      </span>
    </div>
  );
}
