import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HEARTBEAT_MS, openEventStream } from './event-stream';

/** The parts of an Express response the stream uses, recorded. */
function fakeResponse() {
  const response = Object.assign(new EventEmitter(), {
    writableFinished: false,
    destroyed: false,
    writeHead: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  });
  return response;
}

describe('openEventStream', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the SSE headers at once', () => {
    const response = fakeResponse();

    openEventStream(response as unknown as Response);

    expect(response.writeHead).toHaveBeenCalledWith(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
    });
    expect(response.flushHeaders).toHaveBeenCalledOnce();
  });

  it('writes an event as its name, its JSON data and an empty line', () => {
    const response = fakeResponse();

    openEventStream(response as unknown as Response).send('delta', { text: 'Le "passé"' });

    expect(response.write).toHaveBeenCalledWith(
      'event: delta\ndata: {"text":"Le \\"passé\\""}\n\n',
    );
  });

  it('sends a heartbeat comment every 15 seconds, and none after the end', () => {
    const response = fakeResponse();
    const stream = openEventStream(response as unknown as Response);

    vi.advanceTimersByTime(HEARTBEAT_MS * 2);
    expect(response.write).toHaveBeenCalledTimes(2);
    expect(response.write).toHaveBeenCalledWith(': heartbeat\n\n');

    stream.end();
    vi.advanceTimersByTime(HEARTBEAT_MS * 2);
    expect(response.write).toHaveBeenCalledTimes(2);
    expect(response.end).toHaveBeenCalledOnce();
  });

  it('aborts its signal and stops the heartbeat when the browser leaves', () => {
    const response = fakeResponse();
    const stream = openEventStream(response as unknown as Response);

    response.emit('close');
    vi.advanceTimersByTime(HEARTBEAT_MS);

    expect(stream.signal.aborted).toBe(true);
    expect(response.write).not.toHaveBeenCalled();
  });

  it('starts with its signal aborted when the browser left before the stream opened', () => {
    const response = fakeResponse();
    response.destroyed = true;

    const stream = openEventStream(response as unknown as Response);

    expect(stream.signal.aborted).toBe(true);
  });

  // "close" also fires after a normal end: that one must not look like the learner leaving.
  it('keeps its signal when the response closes after a normal end', () => {
    const response = fakeResponse();
    const stream = openEventStream(response as unknown as Response);

    response.writableFinished = true;
    response.emit('close');

    expect(stream.signal.aborted).toBe(false);
  });
});
