import { describe, expect, it } from 'vitest';
import { orthographyHint } from './lesson-feedback';

describe('orthography hints', () => {
  it('explains uppercase answers when lowercase is expected', () => {
    expect(orthographyHint('VOUS', 'vous')).toBe('almostLowercase');
  });
  it('explains a missing capital without telling the learner to lowercase it', () => {
    expect(orthographyHint('paris', 'Paris')).toBe('almostCase');
  });
  it('handles accents, combined mistakes and Unicode normalization', () => {
    expect(orthographyHint('cafe', 'café')).toBe('almostSpelling');
    expect(orthographyHint('CAFE', 'café')).toBe('almostSpelling');
    expect(orthographyHint(' CAFE\u0301 ', 'café')).toBe('almostLowercase');
  });
});
