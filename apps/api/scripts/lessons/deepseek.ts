/**
 * Calls the DeepSeek Chat Completions API (`https://api.deepseek.com/beta/chat/completions`).
 *
 * Uses the `/beta` endpoint so that when a large lesson JSON exceeds `deepseek-chat`'s
 * single-call 8,192 output token limit (`finish_reason === 'length'`), we automatically
 * continue the generation from the exact character where it stopped using DeepSeek's
 * Prefix Completion (`prefix: true`).
 */
import { type ClaudeReply, QuotaError } from './claude';

const DEEPSEEK_BETA_API_URL = 'https://api.deepseek.com/beta/chat/completions';
const MAX_CONTINUATIONS = 6;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  prefix?: boolean;
}

export interface DeepSeekOptions {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  timeoutMs: number;
}

interface DeepSeekResponse {
  id?: string;
  choices?: {
    finish_reason?: string;
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
    };
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
  };
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

/**
 * Approximate DeepSeek API pricing (USD per 1M tokens) to report cost in the summary.
 * DeepSeek V3.2 unified pricing:
 * - cache hit: $0.028 / 1M
 * - cache miss: $0.28 / 1M
 * - output: $0.42 / 1M
 */
function estimateCostUsd(
  cachedTokens: number,
  uncachedInputTokens: number,
  outputTokens: number,
): number {
  return (cachedTokens * 0.028 + uncachedInputTokens * 0.28 + outputTokens * 0.42) / 1_000_000;
}

async function callOnce(
  o: DeepSeekOptions,
  messages: ChatMessage[],
  useJsonFormat: boolean,
): Promise<{
  id: string;
  text: string;
  finishReason: string;
  cachedTokens: number;
  uncachedInput: number;
  outputTokens: number;
}> {
  const isReasoner = o.model.includes('reasoner');
  const response = await fetch(DEEPSEEK_BETA_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${o.apiKey}`,
    },
    body: JSON.stringify({
      model: o.model,
      messages,
      ...(useJsonFormat && !isReasoner ? { response_format: { type: 'json_object' } } : {}),
      max_tokens: isReasoner ? 32768 : 8192,
      ...(isReasoner ? {} : { temperature: 0.3 }),
    }),
    signal: AbortSignal.timeout(o.timeoutMs),
  });

  const rawText = await response.text();
  let data: DeepSeekResponse;
  try {
    data = JSON.parse(rawText) as DeepSeekResponse;
  } catch {
    const snippet = rawText.trim().slice(0, 500);
    throw new Error(`deepseek HTTP ${response.status}: ${snippet}`);
  }

  if (!response.ok || data.error) {
    const msg = data.error?.message ?? rawText.trim().slice(0, 500);
    const isQuota =
      response.status === 402 ||
      response.status === 429 ||
      /insufficient_balance|quota|rate limit/i.test(msg);
    throw isQuota
      ? new QuotaError(`deepseek (${response.status}): ${msg}`)
      : new Error(`deepseek (${response.status}): ${msg}`);
  }

  const choice = data.choices?.[0];
  const text = choice?.message?.content ?? '';
  const finishReason = choice?.finish_reason ?? 'unknown';

  const u = data.usage ?? {};
  const cachedTokens = u.prompt_cache_hit_tokens ?? 0;
  const uncachedInput =
    u.prompt_cache_miss_tokens ?? Math.max(0, (u.prompt_tokens ?? 0) - cachedTokens);
  const outputTokens = u.completion_tokens ?? 0;

  return {
    id: data.id ?? 'deepseek',
    text,
    finishReason,
    cachedTokens,
    uncachedInput,
    outputTokens,
  };
}

export async function askDeepSeek(o: DeepSeekOptions): Promise<ClaudeReply> {
  const started = Date.now();
  let fullText = '';
  let totalCached = 0;
  let totalUncached = 0;
  let totalOutput = 0;
  let lastId = 'deepseek';

  for (let part = 0; part <= MAX_CONTINUATIONS; part++) {
    const reqMessages: ChatMessage[] =
      part === 0
        ? o.messages
        : [...o.messages, { role: 'assistant', content: fullText, prefix: true }];

    // Only set response_format: json_object on the initial call; on prefix continuations
    // the assistant response is a suffix of the already-started JSON object.
    const res = await callOnce(o, reqMessages, part === 0);
    lastId = res.id;
    fullText += res.text;
    totalCached += res.cachedTokens;
    totalUncached += res.uncachedInput;
    totalOutput += res.outputTokens;

    if (res.finishReason !== 'length') break;
  }

  if (!fullText) {
    throw new Error('deepseek returned an empty reply');
  }

  return {
    text: fullText,
    sessionId: lastId,
    durationMs: Date.now() - started,
    inputTokens: totalCached + totalUncached,
    cachedTokens: totalCached,
    outputTokens: totalOutput,
    costUsd: estimateCostUsd(totalCached, totalUncached, totalOutput),
  };
}
