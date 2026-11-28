import type { Language, LessonDiscussionInput } from '@ft/shared';

import { readCode } from './api-client';

/**
 * How a lesson discussion message ended (#151):
 * - ok: the answer came whole, its pieces already handed to onText;
 * - not ok: a code for useErrorMessage. Before the stream, the API's status
 *   with its code (400, 404, 409, 429); after it opened, the code of the
 *   error event, with status 200 (the pieces already sent stay sent).
 *   retryAfter comes with a 429 only: the seconds to wait.
 */
export type DiscussionResult =
  { ok: true } | { ok: false; code: string; status: number; retryAfter?: number };

/**
 * Sends one message to the lesson's tutor and reads the answer as it comes
 * (POST /courses/:lang/lessons/:id/discussion, see discussion.controller.ts
 * in apps/api).
 *
 * Not EventSource: it only sends GET, with no body. So fetch, and the body
 * read by hand, one event at a time. Each event ends with an empty line:
 *   event: delta
 *   data: {"text":"…"}
 * Lines starting with ":" are the server's heartbeat, and say nothing.
 *
 * signal is the learner's Stop, or the page going away. An aborted send
 * returns what it had; the caller knows it stopped it, and ignores it.
 */
export async function sendDiscussion(
  lang: Language,
  id: string,
  body: LessonDiscussionInput,
  onText: (text: string) => void,
  signal: AbortSignal,
): Promise<DiscussionResult> {
  // Read before the stream and after it: a connection cut on either side.
  const cut: DiscussionResult = { ok: false, code: 'network.unreachable', status: 0 };
  let response: Response;
  try {
    response = await fetch(`/api/courses/${lang}/lessons/${id}/discussion`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    return cut;
  }

  // Refused before the stream: the usual JSON error.
  if (!response.ok || response.body === null) {
    const json: unknown = await response.json().catch(() => null);
    const retryAfter = (json as { retryAfter?: unknown } | null)?.retryAfter;
    return {
      ok: false,
      code: readCode(json) ?? 'server.unexpected',
      status: response.status,
      ...(typeof retryAfter === 'number' ? { retryAfter } : {}),
    };
  }

  const reader = response.body.getReader();
  // stream: a character cut between two pieces of the body waits for the rest.
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return cut;
      buffer += decoder.decode(value, { stream: true });
      // A piece of the body can end in the middle of an event: the rest waits for the next one.
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const event = readEvent(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (event === null) continue;
        if (event.name === 'delta') onText(String(event.data.text ?? ''));
        else if (event.name === 'done') return { ok: true };
        else if (event.name === 'error') {
          return { ok: false, code: String(event.data.code ?? 'unknown'), status: response.status };
        }
      }
    }
  } catch {
    // Stop, or the connection dropped while reading.
    return cut;
  } finally {
    // Closes the response when we leave before its end; nothing to do after it.
    reader.cancel().catch(() => undefined);
  }
}

/** One event's lines: its name and its data, or null for a heartbeat. */
function readEvent(block: string): { name: string; data: Record<string, unknown> } | null {
  let name = '';
  let data = '';
  for (const line of block.split('\n')) {
    if (line.startsWith('event: ')) name = line.slice('event: '.length);
    else if (line.startsWith('data: ')) data = line.slice('data: '.length);
  }
  if (name === '') return null;
  try {
    return { name, data: JSON.parse(data) as Record<string, unknown> };
  } catch {
    return { name, data: {} };
  }
}

/**
 * The tutor is thinking: the message is sent and no word of the answer has
 * come (a heartbeat or an empty piece is none). Not once it failed (error),
 * nor once it ended, was stopped or refused (asking is null then).
 */
export function isThinking(asking: { answer: string; error: string | null } | null): boolean {
  return asking !== null && asking.error === null && asking.answer === '';
}
