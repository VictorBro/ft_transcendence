import { describe, expect, it } from 'vitest';
import { LEVELS, type Level } from '@ft/shared';

import {
  courseLevel,
  isDone,
  isLate,
  openCategories,
  probe,
  questionsLeft,
  remainingS,
  initial,
  step,
  type Search,
} from './placement.machine';

/** Answers one question, from whichever category is still open. */
const answer = (search: Search, correct: boolean): Search =>
  step(search, { category: openCategories(search)[0], correct });

/** A whole level: six right passes it, two wrong fail it. */
function level(search: Search, passed: boolean): Search {
  const answers = passed ? [true, true, true, true, true, true] : [false, false];
  return answers.reduce(answer, search);
}

/** Plays one outcome per probed level and records which levels were asked. */
function play(outcomes: boolean[]): { probed: Level[]; search: Search } {
  let search = initial();
  const probed: Level[] = [];
  for (const passed of outcomes) {
    probed.push(probe(search));
    search = level(search, passed);
  }
  return { probed, search };
}

describe('the search', () => {
  it('starts at B1, the middle of six levels, with no special case', () => {
    expect(probe(initial())).toBe('B1');
  });

  /** Every possible verdict, and the one path to each. The course is one above. */
  it.each([
    { path: [false, false], probed: ['B1', 'A1'], course: 'A1', mastered: 'nothing' },
    { path: [false, true, false], probed: ['B1', 'A1', 'A2'], course: 'A2', mastered: 'A1' },
    { path: [false, true, true], probed: ['B1', 'A1', 'A2'], course: 'B1', mastered: 'A2' },
    { path: [true, false, false], probed: ['B1', 'C1', 'B2'], course: 'B2', mastered: 'B1' },
    { path: [true, false, true], probed: ['B1', 'C1', 'B2'], course: 'C1', mastered: 'B2' },
    { path: [true, true, false], probed: ['B1', 'C1', 'C2'], course: 'C2', mastered: 'C1' },
    { path: [true, true, true], probed: ['B1', 'C1', 'C2'], course: 'C2', mastered: 'C2' },
  ])('mastering $mastered teaches $course', ({ path, probed, course }) => {
    const result = play(path);

    expect(result.probed).toEqual(probed);
    expect(isDone(result.search)).toBe(true);
    expect(courseLevel(result.search)).toBe(course);
  });
});

describe('one level', () => {
  it('fails on the second mistake, without asking the rest', () => {
    const failed = answer(answer(initial(), false), false);

    expect(probe(failed)).toBe('A1');
  });

  it('forgives one mistake', () => {
    const passed = [true, false, true, true, true, true].reduce(answer, initial());

    expect(probe(passed)).toBe('C1');
  });

  it('still fails when the second mistake is the sixth answer', () => {
    const failed = [true, true, true, true, false, false].reduce(answer, initial());

    expect(probe(failed)).toBe('A1');
  });

  it('asks two of each category, and starts over on the next level', () => {
    let search = initial();
    const categories: string[] = [];
    for (let i = 0; i < 6; i++) {
      const [category] = openCategories(search);
      categories.push(category);
      search = step(search, { category, correct: true });
    }

    expect(categories.toSorted()).toEqual([
      'grammar',
      'grammar',
      'reading',
      'reading',
      'vocabulary',
      'vocabulary',
    ]);
    expect(openCategories(search)).toEqual(['grammar', 'vocabulary', 'reading']);
  });

  it('ignores an answer once the search is over', () => {
    const done = play([false, false]).search;

    expect(step(done, { category: 'grammar', correct: true })).toBe(done);
  });
});

/**
 * Every answer sequence the exam allows, walked to the end. The verdict is
 * checked against the highest level actually passed, worked out separately
 * from the history, which is the mistake a binary search makes most easily.
 */
describe('every possible run', () => {
  interface Leaf {
    passed: number[];
    probed: Set<Level>;
    answered: number;
    search: Search;
  }

  const leaves: Leaf[] = [];
  const violations: string[] = [];

  function walk(
    search: Search,
    passed: number[],
    probed: Set<Level>,
    answered: number,
    ceiling: number,
  ) {
    // Before the return, so a finished search is held to it too: lo lands exactly on hi + 1.
    if (search.lo < 0 || search.hi >= LEVELS.length || search.lo > search.hi + 1) {
      violations.push(`bounds ${search.lo}..${search.hi}`);
    }
    if (isDone(search)) {
      leaves.push({ passed, probed, answered, search });
      return;
    }
    const total = answered + questionsLeft(search);
    if (total > ceiling) {
      violations.push(`progress total grew from ${ceiling} to ${total}`);
    }
    if (questionsLeft(search) < 1) {
      violations.push('a live run with no question left');
    }
    const level = LEVELS.indexOf(probe(search));
    for (const correct of [true, false]) {
      const next = answer(search, correct);
      const won = next.lo > search.lo ? [...passed, level] : passed;
      walk(next, won, new Set([...probed, probe(search)]), answered + 1, total);
    }
  }

  walk(initial(), [], new Set(), 0, Infinity);

  it('keeps every invariant on every state', () => {
    expect(violations).toEqual([]);
  });

  it('teaches one above the highest level passed, capped at C2', () => {
    const wrong = leaves.filter(({ passed, search }) => {
      const highest = passed.length === 0 ? -1 : Math.max(...passed);
      return courseLevel(search) !== LEVELS[Math.min(highest + 1, LEVELS.length - 1)];
    });

    expect(wrong).toEqual([]);
  });

  it('can probe every level and reach every course', () => {
    const probed = new Set(leaves.flatMap((leaf) => [...leaf.probed]));
    const courses = new Set(leaves.map((leaf) => courseLevel(leaf.search)));

    expect([...probed].toSorted()).toEqual([...LEVELS]);
    expect([...courses].toSorted()).toEqual([...LEVELS]);
  });

  it('asks between 4 and 18 questions, over at most three levels', () => {
    const answered = leaves.map((leaf) => leaf.answered);

    expect(Math.min(...answered)).toBe(4);
    expect(Math.max(...answered)).toBe(18);
    expect(Math.max(...leaves.map((leaf) => leaf.probed.size))).toBe(3);
  });

  it('promises 18 questions up front, the true worst case', () => {
    expect(questionsLeft(initial())).toBe(18);
  });

  it('has nothing left to ask once the search is over', () => {
    expect(questionsLeft(play([false, false]).search)).toBe(0);
  });
});

describe('the clock', () => {
  const served = 1_000_000;

  it('counts down in whole seconds and stops at zero', () => {
    expect(remainingS(served, 30, served)).toBe(30);
    expect(remainingS(served, 30, served + 10_999)).toBe(20);
    expect(remainingS(served, 30, served + 60_000)).toBe(0);
  });

  it('forgives two seconds of round trip and not a millisecond more', () => {
    expect(isLate(served, 30, served + 32_000)).toBe(false);
    expect(isLate(served, 30, served + 32_001)).toBe(true);
  });
});
