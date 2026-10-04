import { LEVELS, type Level } from '@ft/shared';

/**
 * Not a CEFR level and never stored: how the picker says "nothing yet". It is
 * the only route to the A1 course, since every pick teaches the level above.
 */
export const BEGINNER = 'A0';

/** What a learner can claim to have mastered. Null is the beginner. */
export const MASTERY_OPTIONS = [null, ...LEVELS] as const;

/**
 * What the course will teach: the level after the one the learner has reached.
 * Null is a learner who has reached none, so their course is the first one. C2
 * maps to itself, having nothing above it to aim at.
 */
export function nextLevel(mastered: Level | null): Level {
  if (mastered === null) {
    return LEVELS[0];
  }
  const next = LEVELS[LEVELS.indexOf(mastered) + 1];

  return next === undefined ? mastered : next;
}

/**
 * The inverse of nextLevel, for showing a stored course level as the mastery it
 * stands for. C2 reads as C1, the one claim that teaches it without being the top.
 */
export function masteredBelow(level: Level): Level | null {
  const index = LEVELS.indexOf(level);

  return index === 0 ? null : LEVELS[index - 1];
}
