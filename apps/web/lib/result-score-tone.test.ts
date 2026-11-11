import { expect, it } from 'vitest';
import { resultScoreTone } from './result-score-tone';

it.each([
  [0, 'score-low'],
  [49.9, 'score-low'],
  [50, 'score-partial'],
  [69.9, 'score-partial'],
  [70, 'score-passed'],
  [89.9, 'score-passed'],
  [90, 'score-excellent'],
  [100, 'score-excellent'],
])('uses the requested header band for %s percent', (score, expected) => {
  expect(resultScoreTone(score)).toBe(expected);
});
