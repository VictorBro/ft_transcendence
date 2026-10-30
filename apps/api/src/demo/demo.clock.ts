import { type CourseDay, LESSON_PASS_MARK } from '@ft/shared';

import { previousDay } from '../lessons/roadmap.rules';

/*
 * The time and chance of the demo learners (#85). Pure: the replay injects
 * the run instant, and every score comes from a generator seeded by the
 * learner's email, so two seeds on the same day write the same rows.
 */

/** The day `count` days before `day`. 0 is `day` itself. */
export function daysBefore(day: CourseDay, count: number): CourseDay {
  let result = day;
  for (let i = 0; i < count; i++) {
    result = previousDay(result);
  }
  return result;
}

/**
 * How far `timeZone` is ahead of UTC at `at`, in milliseconds: the zone's
 * wall clock read as if it were UTC, minus the real instant. Negative west of
 * Greenwich. h23, so midnight reads 00 and not 24.
 */
function offsetAt(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)!.value);
  const wall = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  return wall - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * The instant it is `minutes` past midnight on `day` in `timeZone`, e.g.
 * 19 * 60 for 19:00. The wall time is first read as UTC, then moved back by
 * the zone's offset. The offset is measured a second time at the result: on
 * a day the clocks change, the offset at the UTC guess can be the other one.
 *
 * A wall time the clocks skip (02:30 on a spring-forward night) has no
 * instant; this then gives one an hour off. The replay only asks for midnight
 * and the evening, which exist in every zone of the profiles.
 */
export function atLocalTime(day: CourseDay, minutes: number, timeZone: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  const wall = Date.UTC(year, month - 1, date, 0, minutes);
  const first = wall - offsetAt(new Date(wall), timeZone);
  return new Date(wall - offsetAt(new Date(first), timeZone));
}

/** A 32-bit seed from a text: FNV-1a, so each email gets its own run of scores. */
export function seedOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A number in [0, 1), the same series for the same seed: mulberry32. */
export type Random = () => number;

export function randomFrom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A past finish's score: a pass (LESSON_PASS_MARK to 100) with probability
 * `passRate`, else a fail (0 to just under the mark). Always two draws, so a
 * change of pass rate does not shift the series of every later score.
 */
export function pastScore(random: Random, passRate: number): number {
  const passes = random() < passRate;
  const spread = random();
  return passes
    ? LESSON_PASS_MARK + Math.floor(spread * (101 - LESSON_PASS_MARK))
    : Math.floor(spread * LESSON_PASS_MARK);
}
