import { describe, expect, it, vi } from 'vitest';
import type { PlacementQuestion, PlacementResult } from '@ft/shared';

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [{ name: 'ft.sid', value: 'abc' }] }),
  headers: async () => ({ get: () => '88.10.20.30' }),
}));

import { DEFAULT_API_INTERNAL_URL } from './api';
import { fetchPlacement, loadPlacement } from './placement';
import { isPlacementResult } from './placement-schema';

/** Built from the exported default rather than written out: the literal reads as
 *  `user:password` to the secret scanner, and one source beats two copies. */
const PLACEMENT_URL = `${DEFAULT_API_INTERNAL_URL}/api/placement`;

/** A grammar question carries no readText: the schema's refine rejects one. */
const question: PlacementQuestion = {
  questionId: '11111111-1111-4111-8111-111111111111',
  category: 'grammar',
  level: 'B1',
  question: 'Hier, je ___ au cinéma.',
  options: ['vais', 'suis allé', 'irai', 'allais'],
  timeLimitS: 30,
  remainingS: 25,
  progress: { answered: 2, maxQuestionsRemaining: 4 },
};

const result: PlacementResult = {
  targetLevel: 'B2',
  report: [
    {
      questionId: '11111111-1111-4111-8111-111111111111',
      question: 'Hier, je ___ au cinéma.',
      options: ['vais', 'suis allé', 'irai', 'allais'],
      chosen: 'vais',
      correct: 'suis allé',
      wasCorrect: false,
    },
  ],
};

describe('fetchPlacement', () => {
  it('returns the question in progress', async () => {
    const fetchImpl = vi.fn(async () => Response.json(question));

    await expect(fetchPlacement({ fetchImpl })).resolves.toEqual({
      status: 'ok',
      data: question,
    });
  });

  // The same endpoint answers with either shape, so the union has to accept
  // both: a run that has ended returns its verdict, not a question.
  it('returns the result once the exam has ended', async () => {
    const fetchImpl = vi.fn(async () => Response.json(result));

    await expect(fetchPlacement({ fetchImpl })).resolves.toEqual({
      status: 'ok',
      data: result,
    });
  });

  // The whole reason this module exists instead of reusing apiGet: a 404 is a
  // verdict ("no run"), not a failure, and the page shows the start control for
  // it rather than an error boundary.
  it('reads a 404 as no run in progress', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }));

    await expect(fetchPlacement({ fetchImpl })).resolves.toEqual({ status: 'no-run' });
  });

  it('reads a 401 as signed out', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 401 }));

    await expect(fetchPlacement({ fetchImpl })).resolves.toEqual({ status: 'signed-out' });
  });

  // placement.invalidSession is a corrupted run, not an absent one. Folding it
  // into no-run would silently offer a fresh start while the broken session is
  // still there to block it.
  it('reads a 409 as unavailable, not as no-run', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: 'placement.invalidSession' }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        }),
    );

    await expect(fetchPlacement({ fetchImpl })).resolves.toMatchObject({ status: 'unavailable' });
  });

  it('reads a 500 as unavailable', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }));

    await expect(fetchPlacement({ fetchImpl })).resolves.toMatchObject({ status: 'unavailable' });
  });

  // A 200 carrying neither shape says nothing about the run, so it must not be
  // mistaken for one: parsing it as a question would crash the render instead.
  it('reads a payload matching neither schema as unavailable', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ not: 'a placement payload' }));

    await expect(fetchPlacement({ fetchImpl })).resolves.toMatchObject({ status: 'unavailable' });
  });

  it('reads a question that leaked its answer as unavailable', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ...question, answer: 'suis allé' }));

    await expect(fetchPlacement({ fetchImpl })).resolves.toMatchObject({ status: 'unavailable' });
  });

  it('reports an unreachable API as unavailable', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });

    await expect(fetchPlacement({ fetchImpl })).resolves.toEqual({
      status: 'unavailable',
      reason: 'ECONNREFUSED',
    });
  });

  it('forwards the cookie and the visitor address', async () => {
    const fetchImpl = vi.fn(async () => Response.json(question));

    await fetchPlacement({ fetchImpl, cookie: 'ft.sid=abc', forwardedFor: '88.10.20.30' });
    expect(fetchImpl).toHaveBeenCalledWith(
      PLACEMENT_URL,
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.objectContaining({
          cookie: 'ft.sid=abc',
          'x-forwarded-for': '88.10.20.30',
        }),
      }),
    );
  });

  it('omits the cookie header entirely when there is none', async () => {
    const fetchImpl = vi.fn(async () => Response.json(question));

    await fetchPlacement({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: { accept: 'application/json' } }),
    );
  });
});

// loadPlacement is the one place this module repeats api.ts's cookie and IP
// plumbing by hand, so it gets its own test rather than being trusted.
describe('loadPlacement', () => {
  it('reads the request cookies and visitor address from the Next context', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(question));

    try {
      await expect(loadPlacement()).resolves.toEqual({ status: 'ok', data: question });
      expect(fetchMock).toHaveBeenCalledWith(
        PLACEMENT_URL,
        expect.objectContaining({
          headers: expect.objectContaining({
            cookie: 'ft.sid=abc',
            'x-forwarded-for': '88.10.20.30',
          }),
        }),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });
});

describe('isPlacementResult', () => {
  it('tells a result from a question', () => {
    expect(isPlacementResult(result)).toBe(true);
    expect(isPlacementResult(question)).toBe(false);
  });
});
