import type { DailyGoal, Language, Level } from '@ft/shared';

/*
 * The six demo learners (#85), as data. Each is replayed through the real
 * services, so every streak and result below follows the rules. Every state
 * the pages check is on French A1, the demo level; the other courses are
 * extras.
 *
 *   anna   streak 3, today met
 *   ben    streak 12, "Reach today's goal to keep it", 1 of 3 today; his A1
 *          results survive a switch to A2 and back
 *   chloe  streak 0, best 12; today 2 of 3, one failed
 *   david  streak 6 still alive, 0 today
 *   eva    French A1 complete, "Start A2"
 *   felix  no French; his English course has no level, so opening it lands
 *          on onboarding step 2 (#52)
 *
 * A level is complete once every lesson is attempted and 80% pass, and a
 * failed lesson is offered again first, so a learner who finishes more
 * lessons than the level holds ends up completing it. Every French profile
 * but eva's therefore finishes fewer than SMALLEST_LEVEL.
 */

/** The fewest lessons a level holds: 12 of each of the 4 kinds. */
export const SMALLEST_LEVEL = 48;

/**
 * The finishes on the days before today, yesterday first: [3, 0, 3] is 3
 * yesterday, none the day before, 3 the day before that.
 *
 * `untilAllAttempted` instead keeps going back, that many finishes a day,
 * until every lesson of the level has a result. How many days that takes
 * depends on the level's lessons and on which scores fail (a failed lesson is
 * offered again first), so the replay works it out.
 */
export type DemoDays = number[] | { untilAllAttempted: number };

export type DemoCourse = {
  lang: Language;
  /** Null: the course was started but never placed. */
  level: Level | null;
  /** Level changes, applied before that day's finishes, in this order. */
  switches: { daysAgo: number; level: Level }[];
  goal: DailyGoal;
  /** The share of past finishes that pass. */
  passRate: number;
  days: DemoDays;
  /** Today's scores, fixed, so today's state never depends on chance. */
  todayScores: number[];
};

export type DemoProfile = {
  /** demo-<name>@example.com, displayed as demo.<name>. */
  name: string;
  timeZone: string;
  /**
   * Replayed in this order. setLevel and setGoal make a course the active
   * one, so the course the learner should land on comes last.
   */
  courses: DemoCourse[];
};

export function demoEmail(name: string): string {
  return `demo-${name}@example.com`;
}

export function demoDisplayName(name: string): string {
  return `demo.${name}`;
}

/**
 * Every demo learner's email, and no one else's: the seed deletes what this
 * matches before rebuilding them. Prisma filters, not a raw LIKE. No e2e
 * prefix (browser-, learner-, finish-, replay-…) starts with demo-.
 */
export const DEMO_EMAIL_FILTER = { startsWith: 'demo-', endsWith: '@example.com' };

/** n days of `count` finishes each. */
const repeat = (n: number, count: number): number[] => Array<number>(n).fill(count);

export const DEMO_PROFILES: DemoProfile[] = [
  {
    name: 'anna',
    timeZone: 'Europe/Zurich',
    courses: [
      {
        lang: 'fr',
        level: 'A1',
        switches: [],
        goal: 10,
        passRate: 0.8,
        days: [1, 1],
        todayScores: [80],
      },
    ],
  },
  {
    name: 'ben',
    timeZone: 'America/New_York',
    courses: [
      {
        lang: 'en',
        level: 'B1',
        switches: [],
        goal: 10,
        passRate: 0.7,
        days: [1, 0, 1, 1],
        todayScores: [],
      },
      {
        lang: 'fr',
        level: 'A1',
        // Mid-streak, so A1 results come before and after the switch.
        switches: [
          { daysAgo: 6, level: 'A2' },
          { daysAgo: 6, level: 'A1' },
        ],
        goal: 30,
        passRate: 0.8,
        // 12 met days up to yesterday: 37 finishes with today's.
        days: repeat(12, 3),
        todayScores: [75],
      },
    ],
  },
  {
    name: 'chloe',
    timeZone: 'Asia/Tokyo',
    courses: [
      {
        lang: 'de',
        level: 'B2',
        switches: [],
        goal: 10,
        passRate: 0.7,
        days: [1, 0, 1],
        todayScores: [],
      },
      {
        lang: 'fr',
        level: 'A1',
        switches: [],
        goal: 30,
        passRate: 0.8,
        // Nothing yesterday, 1 a day for 3 days, then 12 met days ending 5 days
        // ago: 41 finishes with today's.
        days: [0, 1, 1, 1, ...repeat(12, 3)],
        todayScores: [85, 40],
      },
    ],
  },
  {
    name: 'david',
    timeZone: 'Europe/London',
    courses: [
      {
        lang: 'en',
        level: 'C2',
        switches: [],
        goal: 30,
        passRate: 0.7,
        days: [3, 3, 0, 2],
        todayScores: [],
      },
      {
        lang: 'fr',
        level: 'A1',
        switches: [],
        goal: 60,
        passRate: 0.8,
        days: repeat(6, 6),
        todayScores: [],
      },
    ],
  },
  {
    name: 'eva',
    timeZone: 'Europe/Berlin',
    courses: [
      {
        lang: 'de',
        level: 'A2',
        switches: [],
        goal: 30,
        passRate: 0.8,
        days: [],
        todayScores: [],
      },
      {
        lang: 'fr',
        level: 'A1',
        switches: [],
        goal: 60,
        // High enough that well over 80% pass: the level is complete.
        passRate: 0.9,
        days: { untilAllAttempted: 6 },
        todayScores: [],
      },
    ],
  },
  {
    name: 'felix',
    timeZone: 'UTC',
    courses: [
      {
        lang: 'de',
        level: 'C1',
        switches: [],
        goal: 30,
        passRate: 0.7,
        days: [3, 2],
        todayScores: [],
      },
      {
        lang: 'en',
        level: null,
        switches: [],
        goal: 10,
        passRate: 0.7,
        days: [],
        todayScores: [],
      },
    ],
  },
];
