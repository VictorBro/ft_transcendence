import type { Response } from 'express';

/** How often an open stream sends a comment, so no proxy closes it for being silent. */
export const HEARTBEAT_MS = 15_000;

/** An open Server-Sent Events response (see openEventStream). */
export interface EventStream {
  /** Aborted when the browser closes the connection before the end. */
  signal: AbortSignal;
  /** Writes one event: its name, then its data as JSON, then the empty line that ends it. */
  send(event: string, data: object): void;
  /** Stops the heartbeat and closes the response. */
  end(): void;
}

/**
 * Turns an Express response into a Server-Sent Events stream, and sends its
 * 200 at once.
 *
 * After this, the status and headers are gone: an error can no longer be a
 * 4xx or a 5xx, only an event. So every check that can fail with a status
 * runs before this is called.
 *
 * The headers:
 * - text/event-stream: what the browser reads as SSE;
 * - no-cache: a stream is never stored and replayed;
 * - no-transform: asks every proxy on the way not to change the body, so none
 *   compresses it, which would hold the pieces back until enough bytes come.
 *
 * There is no Content-Length, since the length is not known yet: Node then
 * sends the body in chunks, one per write, as it comes.
 */
export function openEventStream(response: Response): EventStream {
  const abort = new AbortController();
  // A comment line (": ...") is ignored by the reader but keeps bytes moving.
  const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), HEARTBEAT_MS);
  // "close" also fires after a normal end(); writableFinished tells the two apart.
  response.on('close', () => {
    clearInterval(heartbeat);
    if (!response.writableFinished) abort.abort();
  });

  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
  });
  // writeHead only prepares the headers; this sends them now, before the first event.
  response.flushHeaders();

  return {
    signal: abort.signal,
    send(event, data) {
      response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    end() {
      clearInterval(heartbeat);
      response.end();
    },
  };
}
