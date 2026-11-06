/**
 * Recently active keeps the UTC day only, written once a day, and lists by
 * name: polling it shows who comes back after a week away, nothing finer.
 */
export const ACTIVE_DAYS = 7;

/** Midnight UTC of `now`, the value a @db.Date column holds for that day. */
export function activeDay(now: Date): Date {
  return new Date(now.toISOString().slice(0, 10));
}

/** The oldest day still in Recently active: today and the 6 before it. */
export function activeSince(now: Date): Date {
  const day = activeDay(now);
  day.setUTCDate(day.getUTCDate() - (ACTIVE_DAYS - 1));
  return day;
}
