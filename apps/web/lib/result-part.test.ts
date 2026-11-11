import { describe, expect, it } from 'vitest';

import { resultPart } from './result-part';

describe('result fragments', () => {
  it('selects practice and exam parts by their one-based URL numbers', () => {
    expect(resultPart('#part-1', 8, 7)).toBe(0);
    expect(resultPart('#part-8', 8, 7)).toBe(7);
  });

  it.each([
    '',
    '#other',
    '#part-0',
    '#part--1',
    '#part-01',
    '#part-2.5',
    '#part-9',
    '#part-99999999999999999999',
  ])('keeps the exam selected for %j', (hash) => {
    expect(resultPart(hash, 8, 7)).toBe(7);
  });
});
