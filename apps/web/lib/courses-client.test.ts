import { afterEach, describe, expect, it, vi } from 'vitest';

import { setCourseLevel, startCourse } from './courses-client';

const course = { lang: 'de', level: null, dailyGoal: 30 };

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

describe('startCourse', () => {
  it('returns the created course, without a level', async () => {
    vi.stubGlobal('fetch', respondWith(201, course));

    await expect(startCourse({ lang: 'de', dailyGoal: 30 })).resolves.toEqual({
      ok: true,
      data: course,
    });
  });

  /** The branch the flow depends on, not an error the caller displays. */
  it('reports an already studied language as a code, not a sentence', async () => {
    vi.stubGlobal('fetch', respondWith(409, { message: 'course.alreadyStarted' }));

    await expect(startCourse({ lang: 'de', dailyGoal: 30 })).resolves.toEqual({
      ok: false,
      code: 'course.alreadyStarted',
      status: 409,
    });
  });

  it('rejects a response that is not a course', async () => {
    vi.stubGlobal('fetch', respondWith(201, { lang: 'de', dailyGoal: 45, level: null }));

    await expect(startCourse({ lang: 'de', dailyGoal: 45 })).resolves.toMatchObject({
      ok: false,
      code: 'server.unexpected',
    });
  });
});

describe('setCourseLevel', () => {
  it('returns the course with its new level', async () => {
    vi.stubGlobal('fetch', respondWith(200, { ...course, level: 'B1' }));

    await expect(setCourseLevel('de', { level: 'B1' })).resolves.toEqual({
      ok: true,
      data: { ...course, level: 'B1' },
    });
  });

  it('puts the language in the path', async () => {
    const fetchMock = respondWith(200, { ...course, level: 'B1' });
    vi.stubGlobal('fetch', fetchMock);

    await setCourseLevel('de', { level: 'B1' });

    expect(fetchMock).toHaveBeenCalledWith('/api/courses/de/level', expect.anything());
  });

  it('reports a missing course as a code', async () => {
    vi.stubGlobal('fetch', respondWith(404, { message: 'course.notFound' }));

    await expect(setCourseLevel('de', { level: 'B1' })).resolves.toEqual({
      ok: false,
      code: 'course.notFound',
      status: 404,
    });
  });
});
