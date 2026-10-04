import { describe, expect, it } from 'vitest';
import { LEVELS } from '@ft/shared';

import { masteredBelow, nextLevel } from './level';

describe('nextLevel', () => {
  it('aims one level above what the learner knows', () => {
    expect(nextLevel('A1')).toBe('A2');
    expect(nextLevel('B1')).toBe('B2');
  });

  /** Nothing sits above C2, so the course maintains it instead. */
  it('keeps C2 at C2', () => {
    expect(nextLevel('C2')).toBe('C2');
  });

  /** A learner who has mastered nothing is the only way to reach the A1 course. */
  it('starts a complete beginner at A1', () => {
    expect(nextLevel(null)).toBe('A1');
  });
});

describe('masteredBelow', () => {
  it('reads an A1 course as a beginner', () => {
    expect(masteredBelow('A1')).toBeNull();
  });

  // Reading C2 as C2 would pass the round trip too: nextLevel keeps C2 at C2.
  it('reads a C2 course as C1, not as the top', () => {
    expect(masteredBelow('C2')).toBe('C1');
  });

  // The picker opens on this, so saving it untouched must write the same level.
  it.each(LEVELS)('round-trips the %s course through nextLevel', (level) => {
    expect(nextLevel(masteredBelow(level))).toBe(level);
  });
});
