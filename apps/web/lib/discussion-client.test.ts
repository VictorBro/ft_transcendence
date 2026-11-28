import { afterEach, describe, expect, it, vi } from 'vitest';

import { isThinking, sendDiscussion } from './discussion-client';

const BODY = {
  attemptId: '11111111-1111-4111-8111-111111111111',
  message: 'Why avoir?',
  history: [],
};

/** A stream response whose body arrives in these pieces, cut anywhere. */
function streamOf(pieces: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) controller.enqueue(encoder.encode(piece));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function send(response: Response | Error) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (response instanceof Error) throw response;
      return response;
    }),
  );
  const texts: string[] = [];
  const result = await sendDiscussion(
    'fr',
    'fr-avoir',
    BODY,
    (text) => texts.push(text),
    new AbortController().signal,
  );
  return { result, texts };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sendDiscussion', () => {
  it('posts the body to the lesson discussion route', async () => {
    await send(streamOf(['event: done\ndata: {}\n\n']));
    expect(fetch).toHaveBeenCalledWith(
      '/api/courses/fr/lessons/fr-avoir/discussion',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(BODY) }),
    );
  });

  it('hands over each piece, then ends ok, whatever the cuts of the body', async () => {
    const { result, texts } = await send(
      streamOf([
        'event: delta\ndata: {"text":"Avoir "}\n\n: heartbeat\n\nevent: del',
        'ta\ndata: {"text":"is to have."}\n',
        '\nevent: done\ndata: {}\n\n',
      ]),
    );
    expect(texts).toEqual(['Avoir ', 'is to have.']);
    expect(result).toEqual({ ok: true });
  });

  it('hands over each piece as it comes, before the end of the stream', async () => {
    const encoder = new TextEncoder();
    let server!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start: (c) => void (server = c) });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status: 200 })),
    );
    const texts: string[] = [];
    const sent = sendDiscussion(
      'fr',
      'fr-avoir',
      BODY,
      (text) => texts.push(text),
      new AbortController().signal,
    );

    server.enqueue(encoder.encode('event: delta\ndata: {"text":"Avoir "}\n\n'));
    await vi.waitFor(() => expect(texts).toEqual(['Avoir ']));
    // "é" is two bytes: cut between them, it waits for the second.
    const rest = encoder.encode('event: delta\ndata: {"text":"été"}\n\nevent: done\ndata: {}\n\n');
    server.enqueue(rest.slice(0, 29));
    server.enqueue(rest.slice(29));
    server.close();
    await expect(sent).resolves.toEqual({ ok: true });
    expect(texts).toEqual(['Avoir ', 'été']);
  });

  it('keeps the pieces before an error event, and gives its code', async () => {
    const { result, texts } = await send(
      streamOf([
        'event: delta\ndata: {"text":"Avoir "}\n\n',
        'event: error\ndata: {"code":"llm.unavailable"}\n\n',
      ]),
    );
    expect(texts).toEqual(['Avoir ']);
    expect(result).toEqual({ ok: false, code: 'llm.unavailable', status: 200 });
  });

  it('says the connection was cut when the body ends with no done', async () => {
    const { result } = await send(streamOf(['event: delta\ndata: {"text":"Avoir "}\n\n']));
    expect(result).toEqual({ ok: false, code: 'network.unreachable', status: 0 });
  });

  it('gives the code and the seconds to wait of a 429', async () => {
    const { result, texts } = await send(
      json(429, { statusCode: 429, message: 'llm.tooManyMessages', retryAfter: 42 }),
    );
    expect(texts).toEqual([]);
    expect(result).toEqual({
      ok: false,
      code: 'llm.tooManyMessages',
      status: 429,
      retryAfter: 42,
    });
  });

  it('gives the code of a refusal before the stream', async () => {
    const { result } = await send(json(409, { statusCode: 409, message: 'attempt.stale' }));
    expect(result).toEqual({ ok: false, code: 'attempt.stale', status: 409 });
  });

  it('says server.unexpected when a refusal has no JSON', async () => {
    const { result } = await send(new Response('Bad gateway', { status: 502 }));
    expect(result).toEqual({ ok: false, code: 'server.unexpected', status: 502 });
  });

  it('says the network is unreachable when fetch fails', async () => {
    const { result } = await send(new TypeError('Failed to fetch'));
    expect(result).toEqual({ ok: false, code: 'network.unreachable', status: 0 });
  });
});

describe('isThinking', () => {
  it('thinks from the send until the first word, through heartbeats and empty pieces', async () => {
    const encoder = new TextEncoder();
    let server!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start: (c) => void (server = c) });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status: 200 })),
    );
    // As discussion.tsx keeps it: set on send, each piece added to the answer.
    let asking: { answer: string; error: string | null } | null = { answer: '', error: null };
    const pieces: string[] = [];
    const sent = sendDiscussion(
      'fr',
      'fr-avoir',
      BODY,
      (text) => {
        pieces.push(text);
        asking = asking && { ...asking, answer: asking.answer + text };
      },
      new AbortController().signal,
    );

    expect(isThinking(asking)).toBe(true);
    server.enqueue(encoder.encode(': heartbeat\n\nevent: delta\ndata: {"text":""}\n\n'));
    await vi.waitFor(() => expect(pieces).toEqual(['']));
    expect(isThinking(asking)).toBe(true);
    // The first word comes later: the dots go.
    server.enqueue(encoder.encode('event: delta\ndata: {"text":"Avoir "}\n\n'));
    await vi.waitFor(() => expect(pieces).toEqual(['', 'Avoir ']));
    expect(isThinking(asking)).toBe(false);
    server.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
    server.close();
    await expect(sent).resolves.toEqual({ ok: true });
  });

  it('stops thinking on an error, and once stopped, refused or done', () => {
    expect(isThinking({ answer: '', error: null })).toBe(true);
    expect(isThinking({ answer: '', error: 'The tutor cannot answer right now.' })).toBe(false);
    expect(isThinking(null)).toBe(false);
  });
});
