import { describe, expect, it } from 'vitest';

import { pick, pickNative } from './localized';

describe('pick', () => {
  const text = { en: 'Check', fr: 'Vérifier', de: 'Überprüfen' };

  it('reads the interface language, English for any other', () => {
    expect(pick(text, 'fr')).toBe('Vérifier');
    expect(pick(text, 'de')).toBe('Überprüfen');
    expect(pick(text, 'en')).toBe('Check');
    expect(pick(text, 'es')).toBe('Check');
  });

  it('reads a native text in the interface language, else the first there is', () => {
    expect(pickNative({ en: 'to speak', de: 'sprechen' }, 'de')).toBe('sprechen');
    expect(pickNative({ en: 'to speak', de: 'sprechen' }, 'fr')).toBe('to speak');
    expect(pickNative({ de: 'sprechen' }, 'fr')).toBe('sprechen');
    expect(pickNative({}, 'fr')).toBe('');
  });
});
