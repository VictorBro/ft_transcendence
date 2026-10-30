import { describe, expect, it } from 'vitest';

import { LESSON_PASS_MARK } from '@ft/shared';

import { localDay, type RuleLesson } from '../lessons/roadmap.rules';
import { atLocalTime, daysBefore, pastScore, randomFrom, seedOf } from './demo.clock';
import {
  DEMO_EMAIL_FILTER,
  DEMO_PROFILES,
  SMALLEST_LEVEL,
  type DemoCourse,
  demoDisplayName,
  demoEmail,
} from './demo.data';
import { daysToAttemptAll, planCourse } from './demo.planner';

const EMAIL = 'demo-test@example.com';

const course = (overrides: Partial<DemoCourse> = {}): DemoCourse => ({
  lang: 'fr',
  level: 'A1',
  switches: [],
  goal: 30,
  passRate: 0.8,
  days: [3, 0, 2],
  todayScores: [85, 40],
  ...overrides,
});

/** The wall clock of `at` in `timeZone`, as HH:MM. */
const wallTime = (at: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);

/** Letters only, like a real lesson id. */
const lessons = (count: number): RuleLesson[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `fr-test-${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + (i % 26))}`,
    level: 'A1',
    position: i + 1,
  }));

describe('atLocalTime', () => {
  it.each([
    ['2026-10-26', 'Asia/Tokyo', '2026-10-25T15:00:00.000Z'],
    ['2026-10-26', 'UTC', '2026-10-26T00:00:00.000Z'],
    // The days the clocks change: the offset at midnight is not the one at 19:00.
    ['2026-03-29', 'Europe/Berlin', '2026-03-28T23:00:00.000Z'],
    ['2026-11-01', 'America/New_York', '2026-11-01T04:00:00.000Z'],
  ])('gives local midnight of %s in %s', (day, timeZone, iso) => {
    expect(atLocalTime(day, 0, timeZone).toISOString()).toBe(iso);
  });

  it.each([
    ['2026-03-29', 'Europe/Berlin'],
    ['2026-10-25', 'Europe/Berlin'],
    ['2026-03-08', 'America/New_York'],
    ['2026-11-01', 'America/New_York'],
  ])('gives 19:00 on %s in %s, on that day', (day, timeZone) => {
    const at = atLocalTime(day, 19 * 60, timeZone);
    expect(wallTime(at, timeZone)).toBe('19:00');
    expect(localDay(at, timeZone)).toBe(day);
  });
});

describe('daysBefore', () => {
  it('crosses months and years', () => {
    expect(daysBefore('2026-03-01', 1)).toBe('2026-02-28');
    expect(daysBefore('2026-01-01', 33)).toBe('2025-11-29');
    expect(daysBefore('2026-10-26', 0)).toBe('2026-10-26');
  });
});

describe('pastScore', () => {
  it('passes at about the pass rate, always within 0 to 100', () => {
    const random = randomFrom(seedOf(EMAIL));
    const scores = Array.from({ length: 5000 }, () => pastScore(random, 0.9));
    const passed = scores.filter((score) => score >= LESSON_PASS_MARK).length;
    expect(passed / scores.length).toBeCloseTo(0.9, 1);
    expect(Math.min(...scores)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...scores)).toBeLessThanOrEqual(100);
  });

  it('gives the same series for the same email, another for another', () => {
    const series = (email: string) => {
      const random = randomFrom(seedOf(email));
      return Array.from({ length: 20 }, () => pastScore(random, 0.5));
    };
    expect(series(EMAIL)).toEqual(series(EMAIL));
    expect(series(EMAIL)).not.toEqual(series('demo-other@example.com'));
  });
});

describe('planCourse', () => {
  // 10:00 in Tokyo on 26 October.
  const RUN_NOW = new Date('2026-10-26T01:00:00.000Z');
  const TOKYO = 'Asia/Tokyo';

  it('lists every day from the oldest to today, a missed day included', () => {
    const days = planCourse(EMAIL, TOKYO, course(), RUN_NOW, []);
    expect(days.map((day) => day.day)).toEqual([
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
    ]);
    // days is yesterday first: [3, 0, 2] is 2 three days ago, none, then 3.
    expect(days.map((day) => day.finishes.length)).toEqual([2, 0, 3, 2]);
  });

  it("takes today in the learner's time zone, not in UTC", () => {
    // 01:00 UTC is still 25 October in New York.
    const days = planCourse(EMAIL, 'America/New_York', course(), RUN_NOW, []);
    expect(days.at(-1)!.day).toBe('2026-10-25');
  });

  it('finishes past days at 19:00 local, ten minutes apart', () => {
    const days = planCourse(EMAIL, TOKYO, course(), RUN_NOW, []);
    const yesterday = days.at(-2)!;
    expect(yesterday.finishes.map((finish) => wallTime(finish.at, TOKYO))).toEqual([
      '19:00',
      '19:10',
      '19:20',
    ]);
  });

  it("spreads today's finishes between local midnight and the run, with their scores", () => {
    const today = planCourse(EMAIL, TOKYO, course(), RUN_NOW, []).at(-1)!;
    const midnight = atLocalTime('2026-10-26', 0, TOKYO);

    expect(today.finishes.map((finish) => finish.score)).toEqual([85, 40]);
    for (const finish of today.finishes) {
      expect(finish.at.getTime()).toBeGreaterThan(midnight.getTime());
      expect(finish.at.getTime()).toBeLessThan(RUN_NOW.getTime());
      expect(localDay(finish.at, TOKYO)).toBe('2026-10-26');
    }
  });

  it('keeps every finish of today on today when the run is just after midnight', () => {
    const justAfter = new Date(atLocalTime('2026-10-26', 0, TOKYO).getTime() + 5 * 60_000);
    const today = planCourse(EMAIL, TOKYO, course(), justAfter, []).at(-1)!;
    for (const finish of today.finishes) {
      expect(localDay(finish.at, TOKYO)).toBe('2026-10-26');
      expect(finish.at.getTime()).toBeLessThan(justAfter.getTime());
    }
  });

  it('gives the same plan on a second run', () => {
    expect(planCourse(EMAIL, TOKYO, course(), RUN_NOW, [])).toEqual(
      planCourse(EMAIL, TOKYO, course(), RUN_NOW, []),
    );
  });

  it('puts the switches on their day, in order, even before the first finish', () => {
    const days = planCourse(
      EMAIL,
      TOKYO,
      course({
        days: [1],
        switches: [
          { daysAgo: 3, level: 'A2' },
          { daysAgo: 3, level: 'A1' },
        ],
      }),
      RUN_NOW,
      [],
    );
    expect(days).toHaveLength(4);
    expect(days[0]).toMatchObject({ day: '2026-10-23', switches: ['A2', 'A1'], finishes: [] });
    expect(days.slice(1).every((day) => day.switches.length === 0)).toBe(true);
  });

  it('replays as many days as it takes to attempt the whole level', () => {
    const level = lessons(120);
    const eva = course({
      goal: 60,
      passRate: 0.9,
      days: { untilAllAttempted: 6 },
      todayScores: [],
    });
    const days = planCourse(EMAIL, TOKYO, eva, RUN_NOW, level);

    const count = daysToAttemptAll(level, 6, eva, randomFrom(seedOf(`${EMAIL}/fr`)));
    // Today, plus the past days, 6 finishes each.
    expect(days).toHaveLength(count + 1);
    expect(days.slice(0, -1).every((day) => day.finishes.length === 6)).toBe(true);
    // 120 lessons at 6 a day is 20 days, plus the failed ones offered again.
    expect(count).toBeGreaterThanOrEqual(20);
    expect(count).toBeLessThanOrEqual(26);
  });
});

describe('daysToAttemptAll', () => {
  it('takes exactly lessons / perDay days when every score passes', () => {
    const allPass = course({ goal: 60, passRate: 1 });
    expect(daysToAttemptAll(lessons(12), 6, allPass, randomFrom(1))).toBe(2);
  });

  it('fails instead of looping when the failed lessons never let it through', () => {
    const neverPasses = course({ goal: 60, passRate: 0 });
    expect(() => daysToAttemptAll(lessons(12), 6, neverPasses, randomFrom(1))).toThrow(
      'never gets every lesson attempted',
    );
  });

  it('needs no day for a level without lessons', () => {
    expect(daysToAttemptAll([], 6, course(), randomFrom(1))).toBe(0);
  });
});

describe('the demo profiles', () => {
  const emails = DEMO_PROFILES.map((profile) => demoEmail(profile.name));
  const matches = (email: string) =>
    email.startsWith(DEMO_EMAIL_FILTER.startsWith) && email.endsWith(DEMO_EMAIL_FILTER.endsWith);

  it('are the six of the issue, each with a valid display name', () => {
    expect(DEMO_PROFILES.map((profile) => profile.name)).toEqual([
      'anna',
      'ben',
      'chloe',
      'david',
      'eva',
      'felix',
    ]);
    for (const profile of DEMO_PROFILES) {
      expect(demoDisplayName(profile.name)).toMatch(/^demo\.[a-z]+$/);
    }
  });

  it('all match the delete filter', () => {
    expect(emails.every(matches)).toBe(true);
  });

  // Every prefix a spec signs up with: the seed must never delete their users.
  it.each([
    'avatar',
    'browser',
    'codes',
    'courses',
    'finish',
    'learner',
    'lessons',
    'placement',
    'replay',
    'totp',
  ])('never match a %s- e2e user', (prefix) => {
    expect(matches(`${prefix}-123@example.com`)).toBe(false);
  });

  // More finishes than lessons and the level ends up complete: only eva's may be.
  it.each(['anna', 'ben', 'chloe', 'david'])(
    "finish fewer lessons than the smallest level: %s's French A1 is never complete",
    (name) => {
      const profile = DEMO_PROFILES.find((p) => p.name === name)!;
      const french = profile.courses.find((c) => c.lang === 'fr')!;
      const days = planCourse(demoEmail(name), profile.timeZone, french, new Date(), []);
      const finishes = days.reduce((sum, day) => sum + day.finishes.length, 0);
      expect(finishes).toBeLessThan(SMALLEST_LEVEL);
    },
  );

  it('end on French, the course the learner lands on, except felix', () => {
    for (const profile of DEMO_PROFILES.filter((profile) => profile.name !== 'felix')) {
      expect(profile.courses.at(-1)!.lang).toBe('fr');
    }
  });
});
