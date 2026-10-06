import { describe, expect, it } from 'vitest';

import {
  type CourseStreak,
  type RuleLesson,
  type RuleResult,
  courseDay,
  currentStreak,
  doneOn,
  isMet,
  levelAfter,
  levelProgress,
  localDay,
  merge,
  metOn,
  plan,
  previousDay,
  queue,
  statusOf,
  target,
} from './roadmap.rules';

const lesson = (id: string, position: number, level: RuleLesson['level'] = 'A1'): RuleLesson => ({
  id,
  position,
  level,
});

const result = (
  lessonId: string,
  score: number,
  day: string,
  finishedAt: string,
  level: RuleResult['level'] = 'A1',
): RuleResult => ({ lessonId, level, score, day, finishedAt: new Date(finishedAt) });

describe('target', () => {
  it('is the daily goal over LESSON_MINUTES', () => {
    expect(target(10)).toBe(1);
    expect(target(30)).toBe(3);
    expect(target(60)).toBe(6);
  });
});

describe('statusOf', () => {
  it('is todo with no result', () => {
    expect(statusOf(undefined)).toBe('todo');
  });

  it('is done at or above the pass mark', () => {
    expect(statusOf(result('l1', 70, '2026-01-01', '2026-01-01T10:00:00Z'))).toBe('done');
  });

  it('is failed below the pass mark', () => {
    expect(statusOf(result('l1', 69, '2026-01-01', '2026-01-01T10:00:00Z'))).toBe('failed');
  });
});

describe('merge', () => {
  const l1 = lesson('l1', 1, 'B1');

  it('starts a lesson with no prior result', () => {
    const now = new Date('2026-01-01T10:00:00Z');
    expect(merge(undefined, l1, 85, '2026-01-01', now)).toEqual({
      lessonId: 'l1',
      level: 'B1',
      score: 85,
      day: '2026-01-01',
      finishedAt: now,
    });
  });

  it('a worse redo keeps the best score and the done status', () => {
    const old = result('l1', 85, '2026-01-01', '2026-01-01T10:00:00Z', 'B1');
    const now = new Date('2026-01-02T10:00:00Z');

    const merged = merge(old, l1, 40, '2026-01-02', now);

    expect(merged.score).toBe(85);
    expect(statusOf(merged)).toBe('done');
    // The day and finishedAt still move: the queue and the streak read the
    // most recent attempt, not the best one.
    expect(merged.day).toBe('2026-01-02');
    expect(merged.finishedAt).toBe(now);
  });

  it('a better redo raises the score', () => {
    const old = result('l1', 40, '2026-01-01', '2026-01-01T10:00:00Z', 'B1');
    const merged = merge(old, l1, 85, '2026-01-02', new Date('2026-01-02T10:00:00Z'));
    expect(merged.score).toBe(85);
  });
});

describe('doneOn', () => {
  it('six finishes of one lesson count once, six different lessons count six', () => {
    // Each merge replaces the previous row for the same lesson, as the
    // service's upsert would: the results array only ever holds the latest one.
    let current: RuleResult | undefined;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      current = merge(
        current,
        lesson('l1', 1),
        50 + attempt,
        '2026-01-01',
        new Date(`2026-01-01T10:0${attempt}:00Z`),
      );
    }
    expect(doneOn([current!], '2026-01-01')).toHaveLength(1);

    const sixLessons = Array.from({ length: 6 }, (_, i) =>
      result(`l${i}`, 80, '2026-01-01', `2026-01-01T10:0${i}:00Z`),
    );
    expect(doneOn(sixLessons, '2026-01-01')).toHaveLength(6);
  });

  it('is any level, pass or fail, ordered by finish time', () => {
    const results = [
      result('l1', 85, '2026-01-01', '2026-01-01T12:00:00Z', 'A1'),
      result('l2', 40, '2026-01-01', '2026-01-01T10:00:00Z', 'B1'),
      result('l3', 85, '2026-01-02', '2026-01-02T10:00:00Z', 'A1'),
    ];
    expect(doneOn(results, '2026-01-01').map((r) => r.lessonId)).toEqual(['l2', 'l1']);
  });
});

describe('isMet', () => {
  it('is met at or above the target', () => {
    expect(isMet(3, 30)).toBe(true);
    expect(isMet(2, 30)).toBe(false);
  });
});

describe('queue', () => {
  it('orders todo and failed lessons by position, before any passed ones', () => {
    const lessons = [lesson('l1', 1), lesson('l2', 2), lesson('l3', 3)];
    const results = [result('l1', 90, '2026-01-01', '2026-01-01T10:00:00Z')];

    expect(queue(lessons, results, '2026-01-02')).toEqual(['l2', 'l3', 'l1']);
  });

  it('orders passed lessons least recently finished first, position as a tiebreak', () => {
    const lessons = [lesson('l1', 1), lesson('l2', 2), lesson('l3', 2)];
    const results = [
      result('l1', 90, '2026-01-01', '2026-01-03T10:00:00Z'),
      result('l2', 90, '2026-01-01', '2026-01-01T10:00:00Z'),
      result('l3', 90, '2026-01-01', '2026-01-01T10:00:00Z'),
    ];

    expect(queue(lessons, results, '2026-01-04')).toEqual(['l2', 'l3', 'l1']);
  });

  it('excludes a lesson finished today, pass or fail', () => {
    const lessons = [lesson('l1', 1), lesson('l2', 2)];
    const results = [result('l1', 40, '2026-01-01', '2026-01-01T10:00:00Z')];

    expect(queue(lessons, results, '2026-01-01')).toEqual(['l2']);
  });

  it('a lesson failed today is not proposed again today, but returns tomorrow at its position', () => {
    const lessons = [lesson('l1', 1), lesson('l2', 2), lesson('l3', 3)];
    const results = [result('l1', 40, '2026-01-01', '2026-01-01T10:00:00Z')];

    expect(queue(lessons, results, '2026-01-01')).toEqual(['l2', 'l3']);
    expect(queue(lessons, results, '2026-01-02')).toEqual(['l1', 'l2', 'l3']);
  });

  it('with only some lessons not yet passed, the rest are review lessons that reorder as they are redone', () => {
    const lessons = [lesson('l1', 1), lesson('l2', 2), lesson('l3', 3), lesson('l4', 4)];
    const results = [
      result('l3', 90, '2026-01-01', '2026-01-01T10:00:00Z'),
      result('l4', 90, '2026-01-01', '2026-01-02T10:00:00Z'),
    ];

    expect(queue(lessons, results, '2026-01-05')).toEqual(['l1', 'l2', 'l3', 'l4']);

    const redone = [
      results[0]!,
      results[1]!,
      result('l3', 90, '2026-01-05', '2026-01-05T10:00:00Z'),
    ];
    // The redo (today) drops l3 from the queue entirely for today...
    expect(queue(lessons, redone, '2026-01-05')).toEqual(['l1', 'l2', 'l4']);
    // ...and tomorrow it is the most recently finished, so it moves last.
    expect(queue(lessons, redone, '2026-01-06')).toEqual(['l1', 'l2', 'l4', 'l3']);
  });
});

describe('plan', () => {
  const lessons = Array.from({ length: 10 }, (_, i) => lesson(`l${i + 1}`, i + 1));

  it('goal 60, two done today: four proposed, three extra', () => {
    const results = [
      result('l1', 85, '2026-01-02', '2026-01-02T10:00:00Z'),
      result('l2', 85, '2026-01-02', '2026-01-02T10:01:00Z'),
    ];

    expect(plan(lessons, results, '2026-01-02', 60)).toEqual({
      done: ['l1', 'l2'],
      proposed: ['l3', 'l4', 'l5', 'l6'],
      extra: ['l7', 'l8', 'l9'],
    });
  });

  it('after a finish from the extra list, the last proposed lesson moves to the head of extra', () => {
    const results = [
      result('l1', 85, '2026-01-02', '2026-01-02T10:00:00Z'),
      result('l2', 85, '2026-01-02', '2026-01-02T10:01:00Z'),
      result('l7', 85, '2026-01-02', '2026-01-02T10:02:00Z'),
    ];

    expect(plan(lessons, results, '2026-01-02', 60)).toEqual({
      done: ['l1', 'l2', 'l7'],
      proposed: ['l3', 'l4', 'l5'],
      extra: ['l6', 'l8', 'l9'],
    });
  });

  it('six done: none proposed, still three extra', () => {
    const results = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'].map((id, i) =>
      result(id, 85, '2026-01-02', `2026-01-02T10:0${i}:00Z`),
    );

    expect(plan(lessons, results, '2026-01-02', 60)).toEqual({
      done: ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'],
      proposed: [],
      extra: ['l7', 'l8', 'l9'],
    });
  });

  it('goal 10 with three done: none proposed, three extra', () => {
    const results = ['l1', 'l2', 'l3'].map((id, i) =>
      result(id, 85, '2026-01-02', `2026-01-02T10:0${i}:00Z`),
    );

    expect(plan(lessons, results, '2026-01-02', 10)).toEqual({
      done: ['l1', 'l2', 'l3'],
      proposed: [],
      extra: ['l4', 'l5', 'l6'],
    });
  });

  it('everything finished today: nothing proposed, no extra', () => {
    const fiveLessons = lessons.slice(0, 5);
    const results = fiveLessons.map((l, i) =>
      result(l.id, 85, '2026-01-02', `2026-01-02T10:0${i}:00Z`),
    );

    expect(plan(fiveLessons, results, '2026-01-02', 60)).toEqual({
      done: fiveLessons.map((l) => l.id),
      proposed: [],
      extra: [],
    });
  });

  it('after a level switch mid-day, a done lesson from the other level still counts and still shows', () => {
    const currentLevel = lessons.slice(0, 3); // the new level's lessons
    const results = [result('old-level-lesson', 85, '2026-01-02', '2026-01-02T10:00:00Z', 'A2')];

    const today = plan(currentLevel, results, '2026-01-02', 10);

    expect(today.done).toEqual(['old-level-lesson']);
    // Counts toward today's target, so a lesson already done this level needs
    // one fewer: target(10) - done.length = 1 - 1 = 0.
    expect(today.proposed).toEqual([]);
  });
});

describe('levelProgress', () => {
  it('A1 results do not count toward A2 progress', () => {
    const a1 = [lesson('a1-1', 1, 'A1'), lesson('a1-2', 2, 'A1')];
    const results = [
      result('a1-1', 85, '2026-01-01', '2026-01-01T10:00:00Z', 'A1'),
      result('a2-1', 85, '2026-01-01', '2026-01-01T10:00:00Z', 'A2'),
    ];

    expect(levelProgress(a1, results)).toEqual({
      total: 2,
      attempted: 1,
      passed: 1,
      needed: 2,
      complete: false,
    });
  });

  it('250 lessons, 230 attempted, 190 passed: 200 needed, not complete', () => {
    const lessons = Array.from({ length: 250 }, (_, i) => lesson(`l${i}`, i + 1));
    const results = Array.from({ length: 230 }, (_, i) =>
      result(`l${i}`, i < 190 ? 85 : 40, '2026-01-01', '2026-01-01T10:00:00Z'),
    );

    expect(levelProgress(lessons, results)).toEqual({
      total: 250,
      attempted: 230,
      passed: 190,
      needed: 200,
      complete: false,
    });
  });

  it('all attempted and 200 of 250 passed: complete', () => {
    const lessons = Array.from({ length: 250 }, (_, i) => lesson(`l${i}`, i + 1));
    const results = Array.from({ length: 250 }, (_, i) =>
      result(`l${i}`, i < 200 ? 85 : 40, '2026-01-01', '2026-01-01T10:00:00Z'),
    );

    expect(levelProgress(lessons, results).complete).toBe(true);
  });

  it('no lessons: not complete', () => {
    expect(levelProgress([], [])).toEqual({
      total: 0,
      attempted: 0,
      passed: 0,
      needed: 0,
      complete: false,
    });
  });
});

describe('levelAfter', () => {
  it('is the next level', () => {
    expect(levelAfter('A1')).toBe('A2');
    expect(levelAfter('B1')).toBe('B2');
    expect(levelAfter('C1')).toBe('C2');
  });

  it('is null after C2', () => {
    expect(levelAfter('C2')).toBeNull();
  });
});

describe('localDay', () => {
  it("is each zone's own civil date, not UTC's", () => {
    const at = new Date('2026-09-24T09:30:00Z');
    expect(localDay(at, 'Pacific/Honolulu')).toBe('2026-09-23');
    expect(localDay(at, 'Australia/Brisbane')).toBe('2026-09-24');
  });

  it('is one calendar day across a daylight saving change', () => {
    // Europe/Zurich springs forward from 02:00 to 03:00 CET on 2026-03-29.
    expect(localDay(new Date('2026-03-29T00:30:00Z'), 'Europe/Zurich')).toBe('2026-03-29');
    expect(localDay(new Date('2026-03-29T01:30:00Z'), 'Europe/Zurich')).toBe('2026-03-29');
  });
});

describe('courseDay', () => {
  it("is today's local day when it is not behind the latest recorded day", () => {
    const now = new Date('2026-01-05T12:00:00Z');
    expect(courseDay(now, 'UTC', null)).toBe('2026-01-05');
    expect(courseDay(now, 'UTC', '2026-01-04')).toBe('2026-01-05');
  });

  it('never returns a day before the latest recorded one, for example after a flight west', () => {
    // 2026-01-05T02:00Z is still 2026-01-04 in Honolulu, but the learner
    // already has a result recorded for 2026-01-05 from before the flight.
    const now = new Date('2026-01-05T02:00:00Z');
    expect(localDay(now, 'Pacific/Honolulu')).toBe('2026-01-04');
    expect(courseDay(now, 'Pacific/Honolulu', '2026-01-05')).toBe('2026-01-05');
  });
});

describe('previousDay', () => {
  it('is the calendar day before', () => {
    expect(previousDay('2026-01-02')).toBe('2026-01-01');
  });

  it('rolls over a month', () => {
    expect(previousDay('2026-02-01')).toBe('2026-01-31');
  });

  it('rolls over a year', () => {
    expect(previousDay('2026-01-01')).toBe('2025-12-31');
  });
});

describe('metOn and currentStreak', () => {
  const empty: CourseStreak = { streak: 0, bestStreak: 0, lastGoalDay: null };

  it('walks a week with a missed day, as the worked example has it', () => {
    let streak: CourseStreak = { streak: 1, bestStreak: 5, lastGoalDay: '2026-09-20' };

    streak = metOn(streak, '2026-09-21');
    expect(streak).toEqual({ streak: 2, bestStreak: 5, lastGoalDay: '2026-09-21' });

    streak = metOn(streak, '2026-09-22');
    expect(streak).toEqual({ streak: 3, bestStreak: 5, lastGoalDay: '2026-09-22' });

    streak = metOn(streak, '2026-09-23');
    expect(streak).toEqual({ streak: 4, bestStreak: 5, lastGoalDay: '2026-09-23' });

    streak = metOn(streak, '2026-09-24');
    expect(streak).toEqual({ streak: 5, bestStreak: 5, lastGoalDay: '2026-09-24' });

    streak = metOn(streak, '2026-09-25');
    expect(streak).toEqual({ streak: 6, bestStreak: 6, lastGoalDay: '2026-09-25' });

    // 2026-09-26 was missed: the goal was never met, so metOn is never called.
    expect(currentStreak(streak, '2026-09-26')).toBe(6);

    streak = metOn(streak, '2026-09-27');
    expect(streak).toEqual({ streak: 1, bestStreak: 6, lastGoalDay: '2026-09-27' });

    streak = metOn(streak, '2026-09-28');
    expect(streak).toEqual({ streak: 2, bestStreak: 6, lastGoalDay: '2026-09-28' });

    // Meeting the same day a second time, e.g. by lowering the goal, changes nothing.
    expect(metOn(streak, '2026-09-28')).toEqual(streak);
  });

  it('starts at one the first time a goal is ever met', () => {
    expect(metOn(empty, '2026-01-01')).toEqual({
      streak: 1,
      bestStreak: 1,
      lastGoalDay: '2026-01-01',
    });
  });

  it('is alive at 00:01 when yesterday was met', () => {
    const streak = { streak: 4, bestStreak: 4, lastGoalDay: '2026-01-04' };
    expect(currentStreak(streak, '2026-01-05')).toBe(4);
  });

  it('shows zero once a day passes with neither today nor yesterday met', () => {
    const streak = { streak: 4, bestStreak: 4, lastGoalDay: '2026-01-04' };
    expect(currentStreak(streak, '2026-01-06')).toBe(0);
  });

  it('the next met day after a gap starts a fresh streak of one', () => {
    const streak = { streak: 4, bestStreak: 4, lastGoalDay: '2026-01-04' };
    expect(metOn(streak, '2026-01-06')).toEqual({
      streak: 1,
      bestStreak: 4,
      lastGoalDay: '2026-01-06',
    });
  });

  it('meeting the same day twice changes nothing', () => {
    const streak = { streak: 2, bestStreak: 6, lastGoalDay: '2026-09-28' };
    expect(metOn(streak, '2026-09-28')).toEqual(streak);
    expect(currentStreak(streak, '2026-09-28')).toBe(2);
  });
});

describe('the day-one walkthrough', () => {
  // A new French A1 course, goal 30 (target 3), day 2026-10-10. Positions 1
  // to 8, matching the worked example in #80's issue.
  const lessons = [
    lesson('fr-greetings', 1),
    lesson('fr-definite-articles', 2),
    lesson('fr-er-verbs-present', 3),
    lesson('fr-cafe-drinks', 4),
    lesson('fr-reading-an-invitation', 5),
    lesson('fr-position-6', 6),
    lesson('fr-position-7', 7),
    lesson('fr-position-8', 8),
  ];
  const day = '2026-10-10';

  it('starts with nothing done', () => {
    expect(plan(lessons, [], day, 30)).toEqual({
      done: [],
      proposed: ['fr-greetings', 'fr-definite-articles', 'fr-er-verbs-present'],
      extra: ['fr-cafe-drinks', 'fr-reading-an-invitation', 'fr-position-6'],
    });
  });

  it('after finishing fr-greetings, done', () => {
    const results = [result('fr-greetings', 85, day, '2026-10-10T08:00:00Z')];
    expect(plan(lessons, results, day, 30)).toEqual({
      done: ['fr-greetings'],
      proposed: ['fr-definite-articles', 'fr-er-verbs-present'],
      extra: ['fr-cafe-drinks', 'fr-reading-an-invitation', 'fr-position-6'],
    });
  });

  it('a failed lesson still counts toward the goal', () => {
    const results = [
      result('fr-greetings', 85, day, '2026-10-10T08:00:00Z'),
      result('fr-definite-articles', 40, day, '2026-10-10T08:05:00Z'),
    ];
    expect(plan(lessons, results, day, 30)).toEqual({
      done: ['fr-greetings', 'fr-definite-articles'],
      proposed: ['fr-er-verbs-present'],
      extra: ['fr-cafe-drinks', 'fr-reading-an-invitation', 'fr-position-6'],
    });
  });

  it('taking the third from extra meets the goal', () => {
    const results = [
      result('fr-greetings', 85, day, '2026-10-10T08:00:00Z'),
      result('fr-definite-articles', 40, day, '2026-10-10T08:05:00Z'),
      result('fr-cafe-drinks', 80, day, '2026-10-10T08:10:00Z'),
    ];
    const today = plan(lessons, results, day, 30);

    expect(today.done).toEqual(['fr-greetings', 'fr-definite-articles', 'fr-cafe-drinks']);
    expect(today.proposed).toEqual([]);
    expect(today.extra).toEqual([
      'fr-er-verbs-present',
      'fr-reading-an-invitation',
      'fr-position-6',
    ]);
    expect(isMet(today.done.length, 30)).toBe(true);
  });

  it('a worse redo of a failed lesson still counts once', () => {
    const results = [
      result('fr-greetings', 85, day, '2026-10-10T08:00:00Z'),
      result('fr-cafe-drinks', 80, day, '2026-10-10T08:10:00Z'),
      // The redo replaces fr-definite-articles's row: best score kept (40),
      // finishedAt moves to the redo.
      merge(
        result('fr-definite-articles', 40, day, '2026-10-10T08:05:00Z'),
        lesson('fr-definite-articles', 2),
        35,
        day,
        new Date('2026-10-10T08:15:00Z'),
      ),
    ];

    expect(doneOn(results, day)).toHaveLength(3);
    expect(statusOf(results[2])).toBe('failed');
    expect(results[2]!.score).toBe(40);
  });

  it('the next day, the failed lesson returns among the ones not yet passed', () => {
    const results = [
      result('fr-greetings', 85, day, '2026-10-10T08:00:00Z'),
      result('fr-definite-articles', 40, day, '2026-10-10T08:05:00Z'),
      result('fr-cafe-drinks', 80, day, '2026-10-10T08:10:00Z'),
    ];
    const nextDay = '2026-10-11';

    expect(plan(lessons, results, nextDay, 30)).toEqual({
      done: [],
      proposed: ['fr-definite-articles', 'fr-er-verbs-present', 'fr-reading-an-invitation'],
      extra: ['fr-position-6', 'fr-position-7', 'fr-position-8'],
    });
  });
});
