import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  preparePlayerNavigation,
  recordPlayerOrigin,
  playerHasLessonOrigin,
} from './lesson-history';

const path = '/learn/fr/lessons/example';
function browser(pathname: string) {
  const state: Record<string, unknown> = { __NA: true };
  const window = {
    location: { pathname },
    history: {
      state,
      replaceState: vi.fn((next) => {
        window.history.state = next;
      }),
    },
  };
  vi.stubGlobal('window', window);
  return window;
}
afterEach(() => vi.unstubAllGlobals());

describe('player return navigation', () => {
  it('remembers lesson navigation on the player entry without losing Next state', () => {
    const window = browser(`/en${path}`);
    preparePlayerNavigation(`${path}/play`);
    window.location.pathname += '/play';
    recordPlayerOrigin(path);
    expect(playerHasLessonOrigin(path)).toBe(true);
    expect(window.history.state.__NA).toBe(true);
    // A reload or Forward has no pending navigation but keeps its origin.
    recordPlayerOrigin(path);
    expect(playerHasLessonOrigin(path)).toBe(true);
    expect(playerHasLessonOrigin('/learn/fr/lessons/other')).toBe(false);
  });
  it('does not go back to results when retaking, or off site on direct visits', () => {
    const window = browser(`/en${path}/results`);
    preparePlayerNavigation(`${path}/play`);
    window.location.pathname = `/en${path}/play`;
    recordPlayerOrigin(path);
    expect(playerHasLessonOrigin(path)).toBe(false);
    expect(window.history.replaceState).not.toHaveBeenCalled();
  });
});
