import {
  LEVELS,
  PLACEMENT_ROUNDS,
  QUESTION_CATEGORIES,
  type Level,
  type QuestionCategory,
} from '@ft/shared';

/**
 * The exam's rules as pure functions: no clock, no database, no Redis.
 *
 * A binary search over LEVELS by index, both bounds inclusive. Passing a level
 * raises lo past it, failing one lowers hi below it, and the search ends when lo
 * passes hi. At that point lo is one past the highest level passed, which is
 * the course to teach, capped at C2.
 */

const PER_LEVEL = PLACEMENT_ROUNDS.perCategory * QUESTION_CATEGORIES.length;

/** Slack for the round trip, so an answer sent on the last second still counts. */
const GRACE_S = 2;

export interface Search {
  lo: number;
  hi: number;
  /** Answers so far at the level being probed, per category. */
  asked: Record<QuestionCategory, number>;
  mistakes: number;
}

export interface Answer {
  category: QuestionCategory;
  correct: boolean;
}

const midpoint = (lo: number, hi: number): number => Math.floor((lo + hi) / 2);

const count = (asked: Search['asked']): number =>
  Object.values(asked).reduce((sum, n) => sum + n, 0);

/** A level not yet asked about, within lo..hi. */
const probing = (lo: number, hi: number): Search => ({
  lo,
  hi,
  asked: { grammar: 0, vocabulary: 0, reading: 0 },
  mistakes: 0,
});

export const initial = (): Search => probing(0, LEVELS.length - 1);

export const isDone = ({ lo, hi }: Search): boolean => lo > hi;

/** The level the next question is drawn from. */
export const probe = ({ lo, hi }: Search): Level => LEVELS[midpoint(lo, hi)];

/** Past C2 there is nothing left to teach, so the course stays there. */
export const courseLevel = ({ lo }: Search): Level => LEVELS[Math.min(lo, LEVELS.length - 1)];

/** Categories still short of their quota at this level. */
export const openCategories = ({ asked }: Search): QuestionCategory[] =>
  QUESTION_CATEGORIES.filter((category) => asked[category] < PLACEMENT_ROUNDS.perCategory);

/**
 * Records one answer. The second mistake fails the level at once, without
 * asking the rest; a full level with at most one mistake passes it.
 */
export function step(search: Search, { category, correct }: Answer): Search {
  if (isDone(search)) {
    return search;
  }
  const { lo, hi } = search;
  const asked = { ...search.asked, [category]: search.asked[category] + 1 };
  const mistakes = search.mistakes + (correct ? 0 : 1);

  if (mistakes > PLACEMENT_ROUNDS.maxMistakes) {
    return probing(lo, midpoint(lo, hi) - 1);
  }
  if (count(asked) === PER_LEVEL) {
    return probing(midpoint(lo, hi) + 1, hi);
  }
  return { ...search, asked, mistakes };
}

/** The most levels a range can still need probing, in the worst case. */
function maxProbes(lo: number, hi: number): number {
  if (lo > hi) {
    return 0;
  }
  const mid = midpoint(lo, hi);
  return 1 + Math.max(maxProbes(lo, mid - 1), maxProbes(mid + 1, hi));
}

/**
 * The most questions the run can still ask, the one on screen included. It only
 * ever shrinks, so answered / (answered + this) never goes backwards.
 */
export const questionsLeft = ({ lo, hi, asked }: Search): number =>
  PER_LEVEL * maxProbes(lo, hi) - count(asked);

/** Seconds left on the countdown, from the server's clock. */
export const remainingS = (servedAt: number, timeLimitS: number, now: number): number =>
  Math.max(0, timeLimitS - Math.floor((now - servedAt) / 1000));

/** Past the limit, whatever the request claims. */
export const isLate = (servedAt: number, timeLimitS: number, now: number): boolean =>
  now - servedAt > (timeLimitS + GRACE_S) * 1000;
