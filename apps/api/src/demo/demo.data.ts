import type { DailyGoal, Language, Level } from '@ft/shared';

/*
 * The six demo learners (#85), as data. Each is replayed through the real
 * services, so every streak and result below follows the rules. Every state
 * the pages check is on French A1, the demo level; the other courses are
 * extras.
 *
 *   anna   streak 3, today met (1 of 1), streak3 earned today
 *   ben    streak 10, "Reach today's goal to keep it", 1 of 3 today: 10
 *          minutes a day until this morning, 30 since; his A1 results
 *          survive a switch to A2 and back
 *   chloe  streak 0, best 7: she raised her goal to 30 two days ago and
 *          missed it; today 2 of 3, one failed
 *   david  streak 6 still alive, 0 today
 *   eva    French A1 complete, "Start A2"
 *   felix  no French; his English course has no level, so opening it lands
 *          on onboarding step 2 (#52)
 *
 * Between them (DEMO_FRIENDSHIPS, DEMO_MESSAGES), anna has two friends, a
 * request waiting on her, one she sent, and two unread messages from ben.
 *
 * A level is complete once every lesson is attempted and 80% pass, and a
 * failed lesson is offered again first, so a learner who finishes as many
 * lessons as the level holds ends up completing it. Every French profile but
 * eva's therefore finishes fewer than SMALLEST_LEVEL in all, past days and
 * today: a lesson stays untried, and today's scores land on lessons not
 * passed yet, so each of today's cards shows the score written here.
 */

/**
 * The ready lessons French A1 holds at least: 12 in content/ today, and the
 * e2e spec pads a database without lessons to it. demo.planner.spec.ts holds
 * content/ to it.
 */
export const SMALLEST_LEVEL = 12;

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
  /** The daily goal the course is started with. */
  goal: DailyGoal;
  /**
   * Goal changes, at most one a day: CoursesService.setGoal at that day's
   * local midnight, after its switches and before its finishes. Not with
   * `untilAllAttempted`, which works its days out at `goal`.
   */
  goalChanges: { daysAgo: number; goal: DailyGoal }[];
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
   * one, so the course the learner should land on comes last, among the
   * courses with a level.
   */
  courses: DemoCourse[];
};

export function demoEmail(name: string): string {
  return `demo-${name}@example.com`;
}

export function demoDisplayName(name: string): string {
  return `demo.${name}`;
}

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
        goalChanges: [],
        passRate: 0.8,
        // The third met day in a row is today's: streak3 is earned today.
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
        goalChanges: [],
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
        // 10 minutes a day for 10 days, 30 from this morning: 1 of 3 today,
        // and a streak of 10 that a goal of 30 would have cost 30 finishes.
        goal: 10,
        goalChanges: [{ daysAgo: 0, goal: 30 }],
        passRate: 0.8,
        // 10 met days up to yesterday: 11 finishes with today's.
        days: repeat(10, 1),
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
        goalChanges: [],
        passRate: 0.7,
        days: [1, 0, 1],
        todayScores: [],
      },
      {
        lang: 'fr',
        level: 'A1',
        switches: [],
        // 7 met days at 10 minutes, then 30 from two days ago: that day's one
        // lesson misses it, and nothing yesterday. 10 finishes with today's.
        goal: 10,
        goalChanges: [{ daysAgo: 2, goal: 30 }],
        passRate: 0.8,
        days: [0, 1, ...repeat(7, 1)],
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
        goalChanges: [],
        passRate: 0.7,
        days: [3, 3, 0, 2],
        todayScores: [],
      },
      {
        lang: 'fr',
        level: 'A1',
        switches: [],
        goal: 10,
        goalChanges: [],
        passRate: 0.8,
        days: repeat(6, 1),
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
        goalChanges: [],
        passRate: 0.8,
        days: [],
        todayScores: [],
      },
      {
        lang: 'fr',
        level: 'A1',
        switches: [],
        goal: 60,
        goalChanges: [],
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
        goalChanges: [],
        passRate: 0.7,
        days: [3, 2],
        todayScores: [],
      },
      {
        lang: 'en',
        level: null,
        switches: [],
        goal: 10,
        goalChanges: [],
        passRate: 0.7,
        days: [],
        todayScores: [],
      },
    ],
  },
];

/**
 * The six demo learners' emails, and no one else's: the seed deletes these
 * before rebuilding them. The exact addresses, not a demo-* pattern: the seed
 * runs on every deploy of a server with DEMO_PASSWORD set, and anyone can sign
 * up there as demo-me@example.com.
 */
export const DEMO_EMAILS: string[] = DEMO_PROFILES.map((profile) => demoEmail(profile.name));

/** A friendship or a request between two demo learners, by profile name, requester first. */
export type DemoFriendship = { from: string; to: string; status: 'pending' | 'accepted' };

/**
 * A message between two demo learners, by profile name, sent `minutesAgo`
 * before the run. Read: `to` read it a minute later. Unread, it counts in
 * the badge of `to`.
 */
export type DemoMessage = {
  from: string;
  to: string;
  minutesAgo: number;
  read: boolean;
  text: string;
};

/**
 * Between demo learners only, so a seed never touches a real account. anna's
 * Friends page: ben and chloe, a request from felix waiting on her (the
 * badge), and one she sent to david. Her Recently active list keeps eva
 * alone: it leaves out anyone she has a request or a friendship with.
 */
export const DEMO_FRIENDSHIPS: DemoFriendship[] = [
  { from: 'anna', to: 'ben', status: 'accepted' },
  { from: 'chloe', to: 'anna', status: 'accepted' },
  { from: 'ben', to: 'david', status: 'accepted' },
  { from: 'eva', to: 'chloe', status: 'accepted' },
  { from: 'felix', to: 'anna', status: 'pending' },
  { from: 'anna', to: 'david', status: 'pending' },
];

/**
 * Between accepted friends, oldest first: a read thread between chloe and
 * anna yesterday, then two messages from ben that anna has not read yet.
 */
export const DEMO_MESSAGES: DemoMessage[] = [
  {
    from: 'chloe',
    to: 'anna',
    minutesAgo: 26 * 60,
    read: true,
    text: 'Coucou Anna ! Tu révises les nombres ce soir ?',
  },
  {
    from: 'anna',
    to: 'chloe',
    minutesAgo: 26 * 60 - 4,
    read: true,
    text: 'Oui, après le dîner. Et toi, ta série ?',
  },
  {
    from: 'chloe',
    to: 'anna',
    minutesAgo: 25 * 60,
    read: true,
    // Seeded in her first local hour, 25 hours back is the evening of the day
    // she missed, before it ended; later, the day after, streak lost. Worded
    // to be true on both.
    text: 'Ça se complique… je suis passée à 30 minutes par jour, trop vite.',
  },
  {
    from: 'ben',
    to: 'anna',
    minutesAgo: 45,
    read: false,
    // His goal goes up at his midnight: seeded in his first 45 local minutes,
    // this is sent the evening before. Worded to be true on both.
    text: 'Hi Anna! Ten days in a row! I am raising my goal to 30 minutes.',
  },
  {
    from: 'ben',
    to: 'anna',
    minutesAgo: 40,
    read: false,
    text: 'Any tip for the indefinite articles lesson?',
  },
];
