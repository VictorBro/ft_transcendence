import { describe, expect, it } from 'vitest';

import { readLimit } from './rate-limits';

describe('readLimit', () => {
  it('keeps the default when the variable is unset or empty', () => {
    expect(readLimit({}, 'SIGNUP_LIMIT_PER_MINUTE', 20)).toBe(20);
    expect(readLimit({ SIGNUP_LIMIT_PER_MINUTE: '' }, 'SIGNUP_LIMIT_PER_MINUTE', 20)).toBe(20);
    expect(readLimit({ SIGNUP_LIMIT_PER_MINUTE: '  ' }, 'SIGNUP_LIMIT_PER_MINUTE', 20)).toBe(20);
  });

  it('takes a positive integer', () => {
    expect(readLimit({ SIGNUP_LIMIT_PER_MINUTE: '50' }, 'SIGNUP_LIMIT_PER_MINUTE', 20)).toBe(50);
  });

  it('refuses anything else, naming the variable', () => {
    for (const raw of ['0', '-3', '2.5', 'twenty', '20req']) {
      expect(() => readLimit({ LOGIN_LIMIT_PER_MINUTE: raw }, 'LOGIN_LIMIT_PER_MINUTE', 5)).toThrow(
        `LOGIN_LIMIT_PER_MINUTE must be a positive integer, not "${raw}"`,
      );
    }
  });
});
