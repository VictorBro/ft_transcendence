import { describe, expect, it } from 'vitest';
import { lessons } from '@ft/shared';

import { newSecret, refOf } from './attempt-ref';

describe('refOf', () => {
  const secret = newSecret();

  it('gives a ref RefSchema accepts', () => {
    expect(lessons.player.RefSchema.safeParse(refOf(secret)('u1')).success).toBe(true);
  });

  it('gives the same ref for the same secret and path', () => {
    expect(refOf(secret)('u1')).toBe(refOf(secret)('u1'));
  });

  it('gives another ref for another path or another secret', () => {
    expect(refOf(secret)('u1')).not.toBe(refOf(secret)('u2'));
    expect(refOf(secret)('u1')).not.toBe(refOf(newSecret())('u1'));
  });
});
