import { describe, expect, it } from 'vitest';

import { gluedAfter } from './lesson-gap';

describe('gluedAfter', () => {
  it('glues a full stop or a comma to the gap, in every language', () => {
    expect(gluedAfter('.', 'fr')).toBe(true);
    expect(gluedAfter(', merci.', 'de')).toBe(true);
  });

  it('keeps the French space before ? and !, and drops it elsewhere', () => {
    expect(gluedAfter('?', 'fr')).toBe(false);
    expect(gluedAfter('?', 'en')).toBe(true);
    expect(gluedAfter('de français.', 'fr')).toBe(false);
    expect(gluedAfter(undefined, 'fr')).toBe(false);
  });
});
