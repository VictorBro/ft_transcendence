import { Logger } from '@nestjs/common';
import { QUESTION_CATEGORIES } from '@ft/shared';
import { z } from 'zod';

import { llmRequestDuration, llmRequests, llmTokens } from '../metrics/metrics';
import {
  LlmError,
  LlmFailure,
  LlmProvider,
  LlmPurpose,
  StreamRequest,
  StructuredRequest,
} from './llm.provider';

// The base address of the Gemini API. The model name and ":generateContent" are added per call.
const API = 'https://generativelanguage.googleapis.com/v1beta/models';
// How long we wait for Gemini before giving up: 60 seconds. "60_000" is just 60000,
// the "_" only makes the number easier to read.
const TIMEOUT_MS = 60_000;
// How a call can end, as the metrics count it: "ok", or the reason of its LlmError.
// Exclude<...> takes 'disabled' out of the reasons: only the fixture uses it.
const OUTCOMES: ('ok' | Exclude<LlmFailure, 'disabled'>)[] = [
  'ok',
  'unreachable',
  'rate_limited',
  'http_error',
  'blocked',
  'incomplete',
  'invalid',
];
// The token counts Gemini reports, as the metrics name them.
const TOKEN_TYPES = ['prompt', 'output', 'total'] as const;
// Every purpose a call can have: one per question category, and the lesson discussion.
// "as const" keeps each text's exact value, so TypeScript accepts it as an LlmPurpose.
const PURPOSES: LlmPurpose[] = [
  ...QUESTION_CATEGORIES.map((category) => `question-batch:${category}` as const),
  'lesson-discussion',
];

/**
 * The parts of Gemini's JSON answer that we read. Gemini sends more fields; we ignore them.
 *
 * Every field has a "?" (optional), because this JSON comes from outside and we do not
 * trust it: any field may be missing. TypeScript then forces us to check before using it.
 *
 * - promptFeedback.blockReason: set when Gemini refused our prompt (safety filters).
 * - candidates: the possible answers. We ask for one, so we read candidates[0].
 *   - finishReason: why the model stopped writing. "STOP" means it finished normally.
 *   - content.parts: the text of the answer, possibly cut into several pieces.
 *     "thought" is true on a piece that is the model's reasoning, not the answer.
 * - usageMetadata: how many tokens the call used (for the logs, and the bill).
 */
interface GeminiReply {
  promptFeedback?: { blockReason?: string };
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string; thought?: boolean }[] };
  }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

/**
 * The real LLM provider: it calls Google's Gemini API over HTTP.
 *
 * It has no @Injectable(): Nest does not build it. llm.factory.ts calls
 * "new GeminiProvider({ apiKey, model })" itself, after checking the settings.
 *
 * Every failure is thrown as an LlmError, with "retryable" saying if a second try
 * could work, and "reason" saying what went wrong, for the metrics.
 */
export class GeminiProvider implements LlmProvider {
  // Nest's logger. Passing the class name puts "[GeminiProvider]" in front of each line.
  private readonly logger = new Logger(GeminiProvider.name);

  // "private readonly options" in the parameter list declares a field and fills it,
  // in one step. The factory gives the key and the model; this class never reads the .env.
  constructor(private readonly options: { apiKey: string; model: string }) {
    // Every purpose, outcome and token type starts at 0. A counter that appears at 1
    // hides its first call from Prometheus' rate(), so the first failures would not
    // count, nor the first call's tokens.
    for (const purpose of PURPOSES) {
      for (const outcome of OUTCOMES) {
        llmRequests.inc({ provider: 'gemini', model: options.model, purpose, outcome }, 0);
      }
      for (const type of TOKEN_TYPES) {
        llmTokens.inc({ provider: 'gemini', model: options.model, purpose, type }, 0);
      }
    }
  }

  /**
   * Sends one request to Gemini and returns the reply, checked by request.schema.
   * This part only measures the call for the metrics (src/metrics/metrics.ts):
   * how long it took and how it ended. send() does the work.
   */
  async generateStructured<S extends z.ZodType>(
    request: StructuredRequest<S>,
  ): Promise<z.output<S>> {
    const labels = { provider: 'gemini', model: this.options.model, purpose: request.purpose };
    // startTimer starts a clock; calling stop() records the time since then.
    const stop = llmRequestDuration.startTimer(labels);
    try {
      const reply = await this.send(request);
      llmRequests.inc({ ...labels, outcome: 'ok' });
      return reply;
    } catch (error) {
      // send() only throws LlmErrors, each with its reason.
      if (error instanceof LlmError) llmRequests.inc({ ...labels, outcome: error.reason });
      throw error;
    } finally {
      // "finally" runs either way, so failures are timed too.
      stop();
    }
  }

  /**
   * The call itself. Steps:
   * 1. Send the HTTP request (fetch). No answer, or the connection drops: retryable error.
   * 2. Read the body as text. A status that is not 2xx: error, retryable or not by status.
   * 3. Parse Gemini's JSON, log the token usage and the time it took, count the tokens.
   * 4. Get the answer text out of it (replyText), then parse and check it (parseReply).
   */
  private async send<S extends z.ZodType>(request: StructuredRequest<S>): Promise<z.output<S>> {
    const { apiKey, model } = this.options;
    // Start time, to log how many milliseconds the call took.
    const started = Date.now();
    // fetch sends the HTTP request. "await" waits for the status and headers.
    // - The key goes in a header, not in the URL, so it does not end up in logs of URLs.
    // - The body is our request turned into a JSON string.
    // - The signal cancels the call after TIMEOUT_MS.
    // - .catch(unreachable): fetch rejects when there is no HTTP answer at all
    //   (no network, DNS error, timeout). unreachable turns that into an LlmError.
    const response = await fetch(`${API}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(requestBody(request)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch(unreachable);
    // Read the body as plain text, not with response.json(): if it is an error page,
    // we can still put its text in the error message.
    const body = await response.text().catch(unreachable);
    // response.ok is true for a status from 200 to 299. Anything else is an error,
    // and isRetryable decides from the status if a second try makes sense.
    if (!response.ok) {
      throw new LlmError(
        `Gemini ${response.status}: ${body}`,
        isRetryable(response.status),
        response.status === 429 ? 'rate_limited' : 'http_error',
      );
    }

    // parseJson returns "unknown" (we do not know the shape yet).
    // "as GeminiReply" tells TypeScript to treat it as GeminiReply. It checks nothing,
    // which is why every field of GeminiReply is optional.
    const reply = parseJson(body, 'response') as GeminiReply;
    // Counted before the reply is checked: one that fails the check was still billed.
    this.record(request.purpose, reply.usageMetadata, started);
    return parseReply(request.schema, replyText(reply));
  }

  /**
   * Sends the conversation to Gemini and gives back its answer piece by piece.
   * Like generateStructured, this part only measures the call; stream() does the work.
   *
   * "async *" makes an async generator: what stream() yields, this one yields too
   * ("yield*" passes on every piece), so the caller reads the answer through it.
   * The call counts as "ok" only once the whole answer has gone through.
   *
   * Two endings count no outcome, only the time: the learner leaving (an AbortError,
   * not an LlmError), and a caller that stops reading early. Neither is Gemini's
   * success or failure.
   */
  async *streamText(request: StreamRequest): AsyncIterable<string> {
    const labels = { provider: 'gemini', model: this.options.model, purpose: request.purpose };
    const stop = llmRequestDuration.startTimer(labels);
    try {
      yield* this.stream(request);
      llmRequests.inc({ ...labels, outcome: 'ok' });
    } catch (error) {
      if (error instanceof LlmError) llmRequests.inc({ ...labels, outcome: error.reason });
      throw error;
    } finally {
      stop();
    }
  }

  /**
   * The streamed call itself. Steps:
   * 1. Send the HTTP request to streamGenerateContent with alt=sse: Google then keeps
   *    the response open and writes the answer in Server-Sent Events, a few words each.
   * 2. A status that is not 2xx: read the body and throw, as send() does.
   * 3. Read the events one by one (sseData). Each is a small GeminiReply: hand its text
   *    on at once, and check it the way replyText checks a whole reply.
   * 4. At the end, the answer must have finished with "STOP" and held some text.
   */
  private async *stream(request: StreamRequest): AsyncIterable<string> {
    const { apiKey, model } = this.options;
    const started = Date.now();
    // Two reasons to cancel, whichever comes first: the learner left (request.signal),
    // or the whole answer took longer than TIMEOUT_MS.
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(TIMEOUT_MS)]);
    // What a failed read becomes. If the learner left, the error stays as it is: it is
    // not Gemini's failure. Anything else (network, timeout, a cut connection) is unreachable.
    const lost = (error: Error): never => {
      if (request.signal.aborted) throw error;
      return unreachable(error);
    };

    const response = await fetch(`${API}/${model}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(streamBody(request)),
      signal,
    }).catch(lost);
    // An error status comes with a normal body (no events): read it whole for the message.
    if (!response.ok || !response.body) {
      const body = await response.text().catch(lost);
      throw new LlmError(
        `Gemini ${response.status}: ${body}`,
        isRetryable(response.status),
        response.status === 429 ? 'rate_limited' : 'http_error',
      );
    }

    let finished = false;
    let wrote = false;
    // Gemini repeats the token counts on its events; the last one has the final numbers.
    let usage: GeminiReply['usageMetadata'];
    try {
      for await (const data of sseData(response.body, lost)) {
        const reply = parseJson(data, 'response') as GeminiReply;
        usage = reply.usageMetadata ?? usage;
        // Refused before any text: the first event says so, and no answer follows.
        const blocked = reply.promptFeedback?.blockReason;
        if (blocked) throw new LlmError(`Gemini blocked the prompt: ${blocked}`, false, 'blocked');

        const candidate = reply.candidates?.[0];
        const text = answerText(candidate);
        if (text) {
          wrote = true;
          yield text;
        }
        // Only the last event has a finishReason. Anything but "STOP" (MAX_TOKENS, SAFETY...)
        // means the answer was cut, after the pieces already sent.
        const reason = candidate?.finishReason;
        if (reason && reason !== 'STOP') {
          throw new LlmError(`Gemini stopped early: ${reason}`, false, 'incomplete');
        }
        if (reason === 'STOP') finished = true;
      }
    } finally {
      // Whatever the ending, even the learner leaving: the tokens used so far were billed.
      this.record(request.purpose, usage, started);
    }
    // The events stopped without a "STOP": Google closed the response before the end.
    if (!finished)
      throw new LlmError('Gemini stopped early: no finish reason', false, 'incomplete');
    if (!wrote) throw new LlmError('Gemini sent an empty answer', false, 'incomplete');
  }

  /**
   * Logs the token usage and the time of one call, and adds the tokens to the metrics.
   * Shared by both calls, so they log and count the same way.
   */
  private record(purpose: LlmPurpose, usage: GeminiReply['usageMetadata'], started: number): void {
    const { model } = this.options;
    // "usage?.x" gives undefined if usage is missing, instead of crashing.
    // "?? '?'" prints "?" when the number is missing.
    this.logger.log(
      `${purpose} on ${model}: ${usage?.promptTokenCount ?? '?'} in, ` +
        `${usage?.candidatesTokenCount ?? '?'} out, ${usage?.totalTokenCount ?? '?'} total tokens, ` +
        `${Date.now() - started} ms`,
    );
    // A number Gemini left out is skipped, not counted as 0.
    const tokens = {
      prompt: usage?.promptTokenCount,
      output: usage?.candidatesTokenCount,
      total: usage?.totalTokenCount,
    };
    for (const [type, count] of Object.entries(tokens)) {
      if (count !== undefined) {
        llmTokens.inc({ provider: 'gemini', model, purpose, type }, count);
      }
    }
  }
}

// The functions below are not exported: they are private helpers of this file.
// They are outside the class because they do not need "this".

/**
 * Builds the JSON body Gemini expects, from our request.
 * - systemInstruction: the rules and role (our "system" text).
 * - contents: the conversation. Here, one message from the user (our "user" text).
 * - generationConfig:
 *   - responseMimeType 'application/json': answer with JSON only.
 *   - responseJsonSchema: the shape the JSON must have. z.toJSONSchema turns our Zod
 *     schema into a JSON Schema, a standard format Gemini understands. Gemini then
 *     follows that shape (fields, types, array lengths).
 *     Careful: rules written with .refine() (like "the answer is one of the options")
 *     cannot be turned into JSON Schema, so Gemini never sees them. They are only
 *     checked later, in parseReply.
 *
 * The parameter type is StructuredRequest<z.ZodType>: any schema works, and this
 * function does not need to know which one.
 */
function requestBody({ system, user, schema }: StructuredRequest<z.ZodType>) {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: z.toJSONSchema(schema),
    },
  };
}

/**
 * Builds the JSON body of a streamed call, from our request.
 * - contents: the whole conversation, oldest first. Gemini names the model's turns
 *   "model", where we say "assistant".
 * - generationConfig.maxOutputTokens: the longest answer we pay for.
 * No JSON schema: the answer is free text for the learner to read.
 */
function streamBody({ system, messages, maxOutputTokens }: StreamRequest) {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map(({ role, text }) => ({
      role: role === 'assistant' ? 'model' : 'user',
      parts: [{ text }],
    })),
    generationConfig: { maxOutputTokens },
  };
}

/**
 * Called when we got no HTTP answer: no network, DNS error, or the timeout fired.
 * Retryable: the network may be fine a moment later.
 * The timeout runs until the body is read, so the connection can drop at either step.
 * That is why both "fetch" and "response.text()" use it.
 * It returns "never" because it always throws. So "await fetch(...).catch(unreachable)"
 * still has the type Response: the catch can never produce another value.
 */
function unreachable(error: Error): never {
  throw new LlmError(`Gemini unreachable: ${error.message}`, true, 'unreachable');
}

/**
 * Decides if an HTTP error status is worth a second try.
 * - 408 (request timeout), 429 (too many requests), 5xx (Google's server failed):
 *   temporary, so yes.
 * - Any other status (400 bad request, 401/403 bad key, 404 unknown model...):
 *   the same request fails the same way twice, so no.
 */
function isRetryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Gets the answer text out of Gemini's reply, or throws if there is no usable answer.
 * A blocked prompt or a truncated reply would come back the same on a retry,
 * so both errors are not retryable.
 */
function replyText(reply: GeminiReply): string {
  // Gemini refused to answer our prompt at all (safety filters).
  const blocked = reply.promptFeedback?.blockReason;
  if (blocked) throw new LlmError(`Gemini blocked the prompt: ${blocked}`, false, 'blocked');

  // We ask for one answer, so we read the first candidate. "?.[0]" gives undefined
  // if the list is missing.
  const candidate = reply.candidates?.[0];
  // Anything but "STOP" means the answer is not complete: "MAX_TOKENS" (too long, cut),
  // "SAFETY" (stopped by filters), etc. No candidate at all also lands here,
  // because undefined is not "STOP".
  if (candidate?.finishReason !== 'STOP') {
    const reason = candidate ? (candidate.finishReason ?? 'no finish reason') : 'no candidate';
    throw new LlmError(`Gemini stopped early: ${reason}`, false, 'incomplete');
  }
  return answerText(candidate);
}

/**
 * The text the model wrote in one candidate, without its reasoning.
 * The answer can come in several parts: drop the reasoning parts ("thought"),
 * keep the text of the others, and glue them together.
 * A part without text gives undefined, and join() writes undefined as "".
 * No candidate gives "": a streamed event may carry only the token counts.
 */
function answerText(candidate: NonNullable<GeminiReply['candidates']>[number] | undefined): string {
  return (candidate?.content?.parts ?? [])
    .filter((part) => !part.thought)
    .map((part) => part.text)
    .join('');
}

/**
 * Turns the answer text into checked data: JSON.parse, then the Zod schema.
 * safeParse does not throw: it returns { success: true, data } or { success: false, error }.
 * If the data does not match the schema (wrong count, answer missing from options...),
 * we throw a retryable LlmError: the model writes something different on every call,
 * so the next try may be fine.
 * z.prettifyError turns Zod's error into a readable message for the logs.
 */
function parseReply<S extends z.ZodType>(schema: S, text: string): z.output<S> {
  const result = schema.safeParse(parseJson(text, 'reply'));
  if (!result.success) throw new LlmError(z.prettifyError(result.error), true, 'invalid');
  return result.data;
}

/**
 * JSON.parse that throws an LlmError instead of a plain SyntaxError.
 * "what" says which text failed, for the error message:
 * - 'response': Gemini's whole HTTP body, or one event of a streamed one.
 * - 'reply': the answer text the model wrote.
 * Retryable in both cases. A 200 that is not JSON is usually an error page from a
 * proxy on the way, so it is as worth retrying as a bad reply from the model.
 * It returns "unknown": the caller must check or cast the value before using it.
 * text.slice(0, 200) keeps the log short.
 */
function parseJson(text: string, what: 'response' | 'reply'): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new LlmError(`Gemini ${what} is not JSON: ${text.slice(0, 200)}`, true, 'invalid');
  }
}

/**
 * Reads a Server-Sent Events body and yields the data of each event, as text.
 *
 * The body arrives in network packets, and a packet is not an event: one packet can
 * hold an event and a half, the other half coming in the next one. So the text is
 * kept in "buffer", and only complete events leave it. An event ends with an empty
 * line ("\n\n"); what follows the last one waits for the next packet.
 *
 * - TextDecoderStream turns the bytes into text. It keeps a character cut between
 *   two packets ("é" is two bytes in UTF-8) until its second byte comes.
 * - "\r\n" becomes "\n": SSE allows both line endings, and only "\n" is searched for.
 *   It runs on the whole buffer, so a "\r" at the end of one packet and its "\n" at
 *   the start of the next are joined first.
 * - lost turns a failed read (the connection dropped, the timeout) into the right error.
 * - "finally" cancels the body when the reader stops early, on a failure or when the
 *   caller leaves: the connection to Google closes instead of staying open for nothing.
 *
 * Text after the last empty line, when the body ends, is dropped: the SSE standard
 * says an event without its empty line is not finished.
 */
async function* sseData(
  body: ReadableStream<Uint8Array>,
  lost: (error: Error) => never,
): AsyncIterable<string> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read().catch(lost);
      if (done) return;
      buffer = (buffer + value).replace(/\r\n/g, '\n');
      let end = buffer.indexOf('\n\n');
      while (end !== -1) {
        const data = eventData(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (data !== undefined) yield data;
        end = buffer.indexOf('\n\n');
      }
    }
  } finally {
    // cancel() rejects on a body that already failed; there is nothing left to close then.
    await reader.cancel().catch(() => undefined);
  }
}

/**
 * The data of one event: its "data:" lines, without "data:" and its one optional
 * space, joined by "\n" as the standard says. Undefined for an event with no data,
 * such as a comment line (": ...") that only keeps the connection alive.
 */
function eventData(event: string): string | undefined {
  const lines = event
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''));
  return lines.length > 0 ? lines.join('\n') : undefined;
}
