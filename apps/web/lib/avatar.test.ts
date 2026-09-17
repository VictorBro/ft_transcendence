import { describe, expect, it } from 'vitest';

import { avatarHue, avatarInitial } from './avatar';

describe('avatarInitial', () => {
  it('upper-cases the first letter', () => {
    expect(avatarInitial('ada')).toBe('A');
  });

  it('does not cut a character in half', () => {
    expect(avatarInitial('🦊fox')).toBe('🦊');
    expect(avatarInitial('日本語')).toBe('日');
  });

  it('falls back rather than rendering nothing', () => {
    expect(avatarInitial('')).toBe('?');
  });
});

describe('avatarHue', () => {
  it('gives the same name the same colour every time', () => {
    expect(avatarHue('Ada')).toBe(avatarHue('Ada'));
  });

  it('gives different names different colours', () => {
    expect(avatarHue('Ada')).not.toBe(avatarHue('Grace'));
  });

  it('stays inside the hue range', () => {
    for (const name of ['', 'a', 'Ada Lovelace', '🦊', '日本語', 'x'.repeat(200)]) {
      expect(avatarHue(name)).toBeGreaterThanOrEqual(0);
      expect(avatarHue(name)).toBeLessThan(360);
    }
  });
});
