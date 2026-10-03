import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlacementQuestion, PlacementResult } from '@ft/shared';

import { quitPlacement, startPlacement, submitPlacementAnswer } from './placement-client';

const question: PlacementQuestion = {
  lang: 'fr',
  questionId: '11111111-1111-4111-8111-111111111111',
  category: 'grammar',
  level: 'B1',
  question: 'Hier, je ___ au cinéma.',
  options: ['vais', 'suis allé', 'irai', 'allais'],
  timeLimitS: 30,
  remainingS: 30,
  progress: { answered: 0, maxQuestionsRemaining: 6 },
};

const result: PlacementResult = {
  lang: 'fr',
  targetLevel: 'B2',
  applied: true,
  report: [
    {
      questionId: '11111111-1111-4111-8111-111111111111',
      level: 'B1',
      question: 'Hier, je ___ au cinéma.',
      options: ['vais', 'suis allé', 'irai', 'allais'],
      chosen: null,
      correct: 'suis allé',
      wasCorrect: false,
    },
  ],
};

function respondWith(status: number, body: unknown = null): typeof fetch {
  return vi.fn(async () =>
    status === 204
      ? new Response(null, { status })
      : new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
  ) as unknown as typeof fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('startPlacement', () => {
  it('posts the language and returns the first question', async () => {
    const fetchMock = respondWith(201, question);
    vi.stubGlobal('fetch', fetchMock);

    await expect(startPlacement('de')).resolves.toEqual({ ok: true, data: question });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/placement',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ lang: 'de' }),
        credentials: 'same-origin',
      }),
    );
  });

  // One run at a time per learner, across every language, so this is the answer
  // a second start gets. It has to reach the UI as its code, not as a crash.
  it('surfaces the conflict code when a run is already open', async () => {
    vi.stubGlobal('fetch', respondWith(409, { message: 'placement.inProgress' }));

    await expect(startPlacement('de')).resolves.toMatchObject({
      ok: false,
      code: 'placement.inProgress',
      status: 409,
    });
  });

  it('surfaces the onboarding guard', async () => {
    vi.stubGlobal('fetch', respondWith(409, { message: 'placement.onboardingIncomplete' }));

    await expect(startPlacement('de')).resolves.toMatchObject({
      ok: false,
      code: 'placement.onboardingIncomplete',
    });
  });

  // The page reads lang to tell its own run from one in another language, so a
  // question without it belongs nowhere and must not reach the screen.
  it('refuses a question that does not say its language', async () => {
    const { lang: _lang, ...unlabelled } = question;
    vi.stubGlobal('fetch', respondWith(201, unlabelled));

    await expect(startPlacement('de')).resolves.toEqual({
      ok: false,
      code: 'server.unexpected',
      status: 201,
    });
  });

  it('reports a dead network rather than throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('failed to fetch');
      }),
    );

    await expect(startPlacement('de')).resolves.toEqual({
      ok: false,
      code: 'network.unreachable',
      status: 0,
    });
  });
});

describe('submitPlacementAnswer', () => {
  it('posts the chosen option and returns the next question', async () => {
    const fetchMock = respondWith(201, question);
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      submitPlacementAnswer('11111111-1111-4111-8111-111111111111', 'suis allé'),
    ).resolves.toEqual({ ok: true, data: question });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/placement/answers',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          questionId: '11111111-1111-4111-8111-111111111111',
          choice: 'suis allé',
        }),
      }),
    );
  });

  // A timeout is an answer, scored wrong: null has to reach the wire as null,
  // not as an omitted field, which the API reads as a broken client.
  it('posts an explicit null when the countdown ran out', async () => {
    const fetchMock = respondWith(201, question);
    vi.stubGlobal('fetch', fetchMock);

    await submitPlacementAnswer('11111111-1111-4111-8111-111111111111', null);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/placement/answers',
      expect.objectContaining({
        body: JSON.stringify({
          questionId: '11111111-1111-4111-8111-111111111111',
          choice: null,
        }),
      }),
    );
  });

  // The last answer comes back as the verdict rather than another question, so
  // both shapes have to parse through the same call.
  it('returns the result when that answer ended the run', async () => {
    vi.stubGlobal('fetch', respondWith(201, result));

    await expect(
      submitPlacementAnswer('11111111-1111-4111-8111-111111111111', 'vais'),
    ).resolves.toEqual({ ok: true, data: result });
  });

  // A run that ended without a verdict has no level to show or to save.
  it('refuses a result without a target level', async () => {
    vi.stubGlobal('fetch', respondWith(201, { ...result, targetLevel: null }));

    await expect(
      submitPlacementAnswer('11111111-1111-4111-8111-111111111111', 'vais'),
    ).resolves.toEqual({ ok: false, code: 'server.unexpected', status: 201 });
  });

  it('surfaces a question mismatch', async () => {
    vi.stubGlobal('fetch', respondWith(409, { message: 'placement.questionMismatch' }));

    await expect(
      submitPlacementAnswer('11111111-1111-4111-8111-111111111111', 'vais'),
    ).resolves.toMatchObject({ ok: false, code: 'placement.questionMismatch' });
  });
});

describe('quitPlacement', () => {
  it('treats the empty 204 as success', async () => {
    const fetchMock = respondWith(204);
    vi.stubGlobal('fetch', fetchMock);

    await expect(quitPlacement()).resolves.toEqual({ ok: true, data: undefined });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/placement',
      expect.objectContaining({ method: 'DELETE', credentials: 'same-origin' }),
    );
  });

  it('surfaces a failure instead of pretending the run was cleared', async () => {
    vi.stubGlobal('fetch', respondWith(500, {}));

    await expect(quitPlacement()).resolves.toMatchObject({
      ok: false,
      code: 'server.unexpected',
      status: 500,
    });
  });
});
