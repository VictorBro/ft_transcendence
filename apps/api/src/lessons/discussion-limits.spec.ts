import { describe, expect, it } from 'vitest';

import { readDiscussionLimits } from './discussion-limits';

describe('readDiscussionLimits', () => {
  it('gives the defaults when nothing is set, or set empty', () => {
    const defaults = { userPerMinute: 6, userPerDay: 60, globalPerMinute: 30 };
    expect(readDiscussionLimits({})).toEqual(defaults);
    expect(readDiscussionLimits({ LLM_DISCUSSION_USER_PER_DAY: ' ' })).toEqual(defaults);
  });

  it('reads each value set', () => {
    expect(
      readDiscussionLimits({
        LLM_DISCUSSION_USER_PER_MINUTE: '3',
        LLM_DISCUSSION_USER_PER_DAY: '0',
        LLM_DISCUSSION_GLOBAL_PER_MINUTE: '100',
      }),
    ).toEqual({ userPerMinute: 3, userPerDay: 0, globalPerMinute: 100 });
  });

  it.each(['six', '1.5', '-1'])('stops the start on %s', (raw) => {
    expect(() => readDiscussionLimits({ LLM_DISCUSSION_USER_PER_MINUTE: raw })).toThrow(
      'LLM_DISCUSSION_USER_PER_MINUTE must be a whole number',
    );
  });
});
