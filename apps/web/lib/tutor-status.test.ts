import { describe, expect, it } from 'vitest';
import { TUTOR_CHECK_STATUSES } from '@ft/shared';

import { STATUS_TONE, TONE_CLASS } from './tutor-status';

describe('STATUS_TONE', () => {
  it('gives every status a tone', () => {
    for (const status of TUTOR_CHECK_STATUSES) {
      expect(TONE_CLASS[STATUS_TONE[status]], status).toBeDefined();
    }
  });

  it.each([
    ['good', ['ok']],
    ['warn', ['quota', 'unreachable']],
    ['bad', ['invalid_key', 'model_not_found', 'quota_day', 'unexpected']],
    ['info', ['fixture', 'disabled']],
  ] as const)('reads as %s: %j', (tone, statuses) => {
    for (const status of statuses) {
      expect(STATUS_TONE[status]).toBe(tone);
    }
  });

  it('paints each tone its own colour', () => {
    const classes = Object.values(TONE_CLASS);

    expect(new Set(classes).size).toBe(classes.length);
  });
});
