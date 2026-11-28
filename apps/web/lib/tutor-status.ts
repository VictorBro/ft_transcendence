import type { TutorCheckStatus } from '@ft/shared';

/**
 * How a key check reads at a glance: good, a short wait (warn), a setting to
 * fix or a day to wait (bad), or nothing to check (info). The icon's shape
 * carries it too, so the colour is never the only sign.
 */
export type Tone = 'good' | 'warn' | 'bad' | 'info';

/**
 * quota and unreachable pass on their own within a minute. The bad ones do not:
 * a setting whoever runs the server must fix, or quota_day, which waits for tomorrow.
 */
export const STATUS_TONE: Record<TutorCheckStatus, Tone> = {
  ok: 'good',
  quota: 'warn',
  quota_day: 'bad',
  unreachable: 'warn',
  invalid_key: 'bad',
  model_not_found: 'bad',
  unexpected: 'bad',
  fixture: 'info',
  disabled: 'info',
};

/** The text colours the rest of the app already uses for each meaning. */
export const TONE_CLASS: Record<Tone, string> = {
  good: 'text-green-400',
  warn: 'text-amber-300',
  bad: 'text-red-400',
  info: 'text-slate-300',
};
