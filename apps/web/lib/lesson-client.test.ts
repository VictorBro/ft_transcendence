import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { lessons } from '@ft/shared';

import {
  clearDrafts,
  forgetAttempt,
  loadDrafts,
  newerAttempt,
  readAttempt,
  rememberAttempt,
  saveDrafts,
  startAttempt,
  submitPage,
  isStale,
} from './lesson-client';

type AttemptView = lessons.player.AttemptView;

const ATTEMPT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const REF = 'AAAAAAAAAAAAAAAA';
const REF2 = 'BBBBBBBBBBBBBBBB';

const page = (index: number, role: 'practice' | 'exam' = 'practice') => ({
  index,
  role,
  scored: true,
  instructions: { en: 'Do it.', fr: 'Fais-le.', de: 'Mach es.' },
  items: [],
});

const attempt = (index: number | null, attemptId = ATTEMPT): AttemptView => ({
  attemptId,
  current: index === null ? null : page(index),
  remainingMs: null,
  practice: { earned: 0, possible: 4 },
  results: null,
});

function respondWith(status: number, body: unknown): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  ) as unknown as typeof fetch;
}

/** A Storage in memory, or one that throws on every call (storage off). */
function storage(broken = false): Storage {
  const data = new Map<string, string>();
  const fail = () => {
    throw new Error('SecurityError');
  };
  return {
    get length() {
      return data.size;
    },
    clear: broken ? fail : () => data.clear(),
    getItem: broken ? fail : (key: string) => data.get(key) ?? null,
    key: (n: number) => [...data.keys()][n] ?? null,
    removeItem: broken ? fail : (key: string) => void data.delete(key),
    setItem: broken ? fail : (key: string, value: string) => void data.set(key, value),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the attempt routes', () => {
  it('starts with the locale and reads the attempt view', async () => {
    const fetchMock = respondWith(201, attempt(0));
    vi.stubGlobal('fetch', fetchMock);

    const result = await startAttempt('fr', 'fr-subject-pronouns', 'de');

    expect(result).toEqual({ ok: true, data: attempt(0) });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/courses/fr/lessons/fr-subject-pronouns/attempt',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ locale: 'de' }) }),
    );
  });

  it('posts the page at its index with the attempt id and the answers', async () => {
    const fetchMock = respondWith(200, { feedback: null, attempt: attempt(3) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await submitPage('fr', 'fr-x', 2, ATTEMPT, { [REF]: { text: 'je' } });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/courses/fr/lessons/fr-x/attempt/pages/2',
      expect.objectContaining({
        body: JSON.stringify({ attemptId: ATTEMPT, answers: { [REF]: { text: 'je' } } }),
      }),
    );
  });

  it('reports a stale page as its code and status', async () => {
    vi.stubGlobal('fetch', respondWith(409, { message: 'attempt.stale' }));
    expect(await submitPage('fr', 'fr-x', 2, ATTEMPT, {})).toEqual({
      ok: false,
      code: 'attempt.stale',
      status: 409,
    });
  });

  it('rejects a view with a key in it', async () => {
    const leaky = { ...attempt(0), answer: 'je' };
    vi.stubGlobal('fetch', respondWith(200, { outline: null, attempt: leaky }));
    expect((await readAttempt('fr', 'fr-x')).ok).toBe(false);
  });
});

describe('the tab memory', () => {
  it('tells a lesson page from the cache that the attempt moved, and a fresh one that it did not', () => {
    // Nothing seen in this tab: the page is as fresh as it gets.
    expect(isStale('fr', 'fr-a', null)).toBe(false);
    rememberAttempt('fr', 'fr-a', attempt(1));
    // Rendered before Start, or before the player moved on.
    expect(isStale('fr', 'fr-a', null)).toBe(true);
    expect(isStale('fr', 'fr-a', { attemptId: ATTEMPT, index: 0 })).toBe(true);
    // Rendered after: the same page, or further (another tab).
    expect(isStale('fr', 'fr-a', { attemptId: ATTEMPT, index: 1 })).toBe(false);
    expect(isStale('fr', 'fr-a', { attemptId: ATTEMPT, index: null })).toBe(false);
    // Another attempt than the tab's last: a retake since.
    expect(isStale('fr', 'fr-a', { attemptId: OTHER, index: null })).toBe(true);
    expect(isStale('fr', 'fr-b', null)).toBe(false);
  });

  it('forgets a lesson whose newer attempt came from elsewhere', () => {
    rememberAttempt('fr', 'fr-d', attempt(1));
    expect(isStale('fr', 'fr-d', { attemptId: OTHER, index: 0 })).toBe(true);
    forgetAttempt('fr', 'fr-d');
    expect(isStale('fr', 'fr-d', { attemptId: OTHER, index: 0 })).toBe(false);
  });

  it('keeps the further cursor of the same attempt, with when it arrived', () => {
    rememberAttempt('fr', 'fr-c', attempt(5), 1000);
    // Forward: the page as first rendered, at page 2.
    expect(newerAttempt('fr', 'fr-c', attempt(2), 2000)).toEqual({ view: attempt(5), at: 1000 });
    // A reload: the server is ahead.
    expect(newerAttempt('fr', 'fr-c', attempt(7), 3000)).toEqual({ view: attempt(7), at: 3000 });
    // Finished beats any page.
    rememberAttempt('fr', 'fr-c', attempt(null), 4000);
    expect(newerAttempt('fr', 'fr-c', attempt(9), 5000).view.current).toBeNull();
  });

  it('takes the rendered attempt after a retake, and when the tab saw none', () => {
    rememberAttempt('fr', 'fr-d', attempt(5), 1000);
    expect(newerAttempt('fr', 'fr-d', attempt(0, OTHER), 2000)).toEqual({
      view: attempt(0, OTHER),
      at: 2000,
    });
    expect(newerAttempt('fr', 'fr-e', attempt(0), 3000).at).toBe(3000);
  });
});

describe('the drafts', () => {
  const slot = { lang: 'fr', id: 'fr-a', attemptId: ATTEMPT } as const;
  const other = { ...slot, attemptId: OTHER };

  beforeEach(() => {
    vi.stubGlobal('window', { localStorage: storage() });
  });

  it('keeps the drafts of an attempt by unit ref, and clears them', () => {
    saveDrafts(slot, { [REF]: { text: 'tu' }, [REF2]: { option: REF } });
    expect(loadDrafts(slot)).toEqual({ [REF]: { text: 'tu' }, [REF2]: { option: REF } });
    clearDrafts(slot);
    expect(loadDrafts(slot)).toEqual({});
    expect(window.localStorage.length).toBe(0);
  });

  it("sweeps the lesson's other attempts, and leaves other lessons alone", () => {
    saveDrafts(other, { [REF]: { text: 'old' } });
    saveDrafts({ ...slot, id: 'fr-b' }, { [REF]: { text: 'b' } });
    saveDrafts(slot, { [REF]: { text: 'tu' } });
    expect(loadDrafts(slot)).toEqual({ [REF]: { text: 'tu' } });
    expect(loadDrafts(other)).toEqual({});
    expect(loadDrafts({ ...slot, id: 'fr-b' })).toEqual({ [REF]: { text: 'b' } });
  });

  it('drops what is not a draft: a bad ref, a bad answer, broken JSON', () => {
    window.localStorage.setItem(
      `ft.lesson.drafts.fr.fr-a.${ATTEMPT}`,
      JSON.stringify({ [REF]: { text: 'ok' }, short: { text: 'x' }, [REF2]: { nope: 1 } }),
    );
    expect(loadDrafts(slot)).toEqual({ [REF]: { text: 'ok' } });
    window.localStorage.setItem(`ft.lesson.drafts.fr.fr-a.${OTHER}`, '{');
    expect(loadDrafts(other)).toEqual({});
  });

  it('works without storage', () => {
    vi.stubGlobal('window', { localStorage: storage(true) });
    expect(() => saveDrafts(slot, { [REF]: { text: 'tu' } })).not.toThrow();
    expect(loadDrafts(slot)).toEqual({});
  });
});
