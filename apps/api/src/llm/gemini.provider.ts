import { Logger } from '@nestjs/common';
import { z } from 'zod';

import { LlmError, LlmProvider, StructuredRequest } from './llm.provider';

// The base address of the Gemini API. The model name and ":generateContent" are added per call.
const API = 'https://generativelanguage.googleapis.com/v1beta/models';
// How long we wait for Gemini before giving up: 60 seconds. "60_000" is just 60000,
// the "_" only makes the number easier to read.
const TIMEOUT_MS = 60_000;

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
 * could work.
 */
export class GeminiProvider implements LlmProvider {
  // Nest's logger. Passing the class name puts "[GeminiProvider]" in front of each line.
  private readonly logger = new Logger(GeminiProvider.name);

  // "private readonly options" in the parameter list declares a field and fills it,
  // in one step. The factory gives the key and the model; this class never reads the .env.
  constructor(private readonly options: { apiKey: string; model: string }) {}

  /**
   * Sends one request to Gemini and returns the reply, checked by request.schema.
   * Steps:
   * 1. Send the HTTP request (fetch). No answer, or the connection drops: retryable error.
   * 2. Read the body as text. A status that is not 2xx: error, retryable or not by status.
   * 3. Parse Gemini's JSON and log the token usage and the time it took.
   * 4. Get the answer text out of it (replyText), then parse and check it (parseReply).
   */
  async generateStructured<S extends z.ZodType>(
    request: StructuredRequest<S>,
  ): Promise<z.output<S>> {
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
      throw new LlmError(`Gemini ${response.status}: ${body}`, isRetryable(response.status));
    }

    // parseJson returns "unknown" (we do not know the shape yet).
    // "as GeminiReply" tells TypeScript to treat it as GeminiReply. It checks nothing,
    // which is why every field of GeminiReply is optional.
    const reply = parseJson(body, 'response') as GeminiReply;
    const usage = reply.usageMetadata;
    // "usage?.x" gives undefined if usage is missing, instead of crashing.
    // "?? '?'" prints "?" when the number is missing.
    this.logger.log(
      `${request.purpose} on ${model}: ${usage?.promptTokenCount ?? '?'} in, ` +
        `${usage?.candidatesTokenCount ?? '?'} out, ${usage?.totalTokenCount ?? '?'} total tokens, ` +
        `${Date.now() - started} ms`,
    );
    return parseReply(request.schema, replyText(reply));
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
 * Called when we got no HTTP answer: no network, DNS error, or the timeout fired.
 * Retryable: the network may be fine a moment later.
 * The timeout runs until the body is read, so the connection can drop at either step.
 * That is why both "fetch" and "response.text()" use it.
 * It returns "never" because it always throws. So "await fetch(...).catch(unreachable)"
 * still has the type Response: the catch can never produce another value.
 */
function unreachable(error: Error): never {
  throw new LlmError(`Gemini unreachable: ${error.message}`, true);
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
  if (blocked) throw new LlmError(`Gemini blocked the prompt: ${blocked}`, false);

  // We ask for one answer, so we read the first candidate. "?.[0]" gives undefined
  // if the list is missing.
  const candidate = reply.candidates?.[0];
  // Anything but "STOP" means the answer is not complete: "MAX_TOKENS" (too long, cut),
  // "SAFETY" (stopped by filters), etc. No candidate at all also lands here,
  // because undefined is not "STOP".
  if (candidate?.finishReason !== 'STOP') {
    const reason = candidate ? (candidate.finishReason ?? 'no finish reason') : 'no candidate';
    throw new LlmError(`Gemini stopped early: ${reason}`, false);
  }
  // Here TypeScript knows candidate is defined: if it were undefined, we would have thrown.
  // The answer can come in several parts: drop the reasoning parts ("thought"),
  // keep the text of the others, and glue them together.
  // A part without text gives undefined, and join() writes undefined as "".
  return (candidate.content?.parts ?? [])
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
  if (!result.success) throw new LlmError(z.prettifyError(result.error), true);
  return result.data;
}

/**
 * JSON.parse that throws an LlmError instead of a plain SyntaxError.
 * "what" says which text failed, for the error message:
 * - 'response': Gemini's whole HTTP body.
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
    throw new LlmError(`Gemini ${what} is not JSON: ${text.slice(0, 200)}`, true);
  }
}
