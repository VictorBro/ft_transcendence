import { describe, expect, it } from 'vitest';

import { activeDay, activeSince } from './active-day';

describe('activeDay', () => {
  it('keeps the UTC day, whatever the time', () => {
    expect(activeDay(new Date('2026-11-06T00:00:00.000Z'))).toEqual(new Date('2026-11-06'));
    expect(activeDay(new Date('2026-11-06T23:59:59.999Z'))).toEqual(new Date('2026-11-06'));
  });
});

describe('activeSince', () => {
  it('goes back 6 days, so the window is a week with today', () => {
    expect(activeSince(new Date('2026-11-06T12:00:00Z'))).toEqual(new Date('2026-10-31'));
  });

  it('crosses a month and a year', () => {
    expect(activeSince(new Date('2026-01-03T08:00:00Z'))).toEqual(new Date('2025-12-28'));
  });
});
