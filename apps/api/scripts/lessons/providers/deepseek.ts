/**
 * The DeepSeek Chat Completions API, paid per token from DEEPSEEK_API_KEY.
 * Only with `--provider deepseek`: a key in .env never switches a run to
 * a paid provider on its own.
 *
 * It uses the /beta endpoint for one reason: when a lesson is longer than
 * one call's output limit (finish_reason "length"), the next call resumes
 * the reply where it stopped (Prefix Completion, `prefix: true`).
 */
import type { LessonKind } from '@ft/shared';

import type { Json } from '../json';
import { systemPrompt } from '../prompt';
import { QUOTA_MESSAGE, QuotaError, type Chat, type Provider, type Reply } from './chat';

const URL = 'https://api.deepseek.com/beta/chat/completions';
/** How many times one reply may be resumed after hitting the output limit. */
const MAX_CONTINUATIONS = 6;

/** USD per million tokens (DeepSeek V3.2): to report what a run cost. */
const PRICE = { cacheHit: 0.028, cacheMiss: 0.28, output: 0.42 };

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
  /** On the last assistant message: the reply continues from its text. */
  prefix?: boolean;
}

export interface DeepSeekOptions {
  apiKey: string;
  /** deepseek-chat or deepseek-reasoner. */
  model: string;
  timeoutMs: number;
}

/**
 * One API call. A 402 (no balance), a 429 or a quota message is a
 * QuotaError; any other failure an Error.
 */
async function callOnce(o: DeepSeekOptions, messages: Message[], first: boolean) {
  const reasoner = o.model.includes('reasoner');
  const response = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${o.apiKey}` },
    body: JSON.stringify({
      model: o.model,
      messages,
      // JSON mode only on the first call: a continuation is the rest of an object already started.
      ...(first && !reasoner ? { response_format: { type: 'json_object' } } : {}),
      max_tokens: reasoner ? 32_768 : 8_192,
      ...(reasoner ? {} : { temperature: 0.3 }),
    }),
    signal: AbortSignal.timeout(o.timeoutMs),
  });

  const raw = await response.text();
  let data: Json;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`deepseek HTTP ${response.status}: ${raw.trim().slice(0, 500)}`);
  }
  if (!response.ok || data.error) {
    const message = `deepseek (${response.status}): ${data.error?.message ?? raw.trim().slice(0, 500)}`;
    const quota = response.status === 402 || response.status === 429 || QUOTA_MESSAGE.test(message);
    throw quota ? new QuotaError(message) : new Error(message);
  }

  const choice = data.choices?.[0];
  const u = data.usage ?? {};
  const cached = u.prompt_cache_hit_tokens ?? 0;
  return {
    text: String(choice?.message?.content ?? ''),
    cutOff: choice?.finish_reason === 'length',
    cached,
    uncached: u.prompt_cache_miss_tokens ?? Math.max(0, (u.prompt_tokens ?? 0) - cached),
    output: u.completion_tokens ?? 0,
  };
}

/** One reply, resumed as long as it is cut off by the output limit. */
async function ask(o: DeepSeekOptions, messages: Message[]): Promise<Reply> {
  let text = '';
  let cached = 0;
  let uncached = 0;
  let output = 0;
  for (let part = 0; part <= MAX_CONTINUATIONS; part++) {
    const history: Message[] =
      part === 0 ? messages : [...messages, { role: 'assistant', content: text, prefix: true }];
    const res = await callOnce(o, history, part === 0);
    text += res.text;
    cached += res.cached;
    uncached += res.uncached;
    output += res.output;
    if (!res.cutOff) break;
  }
  if (!text) throw new Error('deepseek returned an empty reply');
  return {
    text,
    inputTokens: cached + uncached,
    cachedTokens: cached,
    outputTokens: output,
    costUsd:
      (cached * PRICE.cacheHit + uncached * PRICE.cacheMiss + output * PRICE.output) / 1_000_000,
  };
}

export function deepseekProvider(o: DeepSeekOptions): Provider {
  return {
    name: 'deepseek',
    model: o.model,
    billed: true,
    where: `api: ${URL}`,
    startChat(kind: LessonKind): Chat {
      // The API keeps no state: the chat sends the whole conversation each time.
      const messages: Message[] = [{ role: 'system', content: systemPrompt(kind) }];
      return {
        async send(prompt) {
          messages.push({ role: 'user', content: prompt });
          const reply = await ask(o, messages);
          messages.push({ role: 'assistant', content: reply.text });
          return reply;
        },
      };
    },
  };
}
