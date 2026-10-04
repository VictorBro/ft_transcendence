import { Logger } from '@nestjs/common';
import { z } from 'zod';

import { LlmError, LlmProvider, StructuredRequest } from './llm.provider';

const API = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 60_000;

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

export class GeminiProvider implements LlmProvider {
  private readonly logger = new Logger(GeminiProvider.name);

  constructor(private readonly options: { apiKey: string; model: string }) {}

  async generateStructured<S extends z.ZodType>(
    request: StructuredRequest<S>,
  ): Promise<z.output<S>> {
    const { apiKey, model } = this.options;
    const started = Date.now();
    const response = await fetch(`${API}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(requestBody(request)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch(unreachable);
    const body = await response.text().catch(unreachable);
    if (!response.ok) {
      throw new LlmError(`Gemini ${response.status}: ${body}`, isRetryable(response.status));
    }

    const reply = parseJson(body, 'response') as GeminiReply;
    const usage = reply.usageMetadata;
    this.logger.log(
      `${request.purpose} on ${model}: ${usage?.promptTokenCount ?? '?'} in, ` +
        `${usage?.candidatesTokenCount ?? '?'} out, ${usage?.totalTokenCount ?? '?'} total tokens, ` +
        `${Date.now() - started} ms`,
    );
    return parseReply(request.schema, replyText(reply));
  }
}

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

// The timeout runs until the body is read, so the connection can drop at either step.
function unreachable(error: Error): never {
  throw new LlmError(`Gemini unreachable: ${error.message}`, true);
}

// Rate limits, timeouts and server faults pass; any other status fails the same way twice.
function isRetryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

// A blocked prompt or a truncated reply would come back the same on a retry.
function replyText(reply: GeminiReply): string {
  const blocked = reply.promptFeedback?.blockReason;
  if (blocked) throw new LlmError(`Gemini blocked the prompt: ${blocked}`, false);

  const candidate = reply.candidates?.[0];
  if (candidate?.finishReason !== 'STOP') {
    const reason = candidate ? (candidate.finishReason ?? 'no finish reason') : 'no candidate';
    throw new LlmError(`Gemini stopped early: ${reason}`, false);
  }
  return (candidate.content?.parts ?? [])
    .filter((part) => !part.thought)
    .map((part) => part.text)
    .join('');
}

// Sampling differs on every call, so a malformed reply is worth one more try.
function parseReply<S extends z.ZodType>(schema: S, text: string): z.output<S> {
  const result = schema.safeParse(parseJson(text, 'reply'));
  if (!result.success) throw new LlmError(z.prettifyError(result.error), true);
  return result.data;
}

// A 200 that is not JSON is a proxy's error page, so it is as worth retrying as a bad reply.
function parseJson(text: string, what: 'response' | 'reply'): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new LlmError(`Gemini ${what} is not JSON: ${text.slice(0, 200)}`, true);
  }
}
