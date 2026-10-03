import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { GeminiProvider } from './gemini.provider';

const PROMPT = {
  system: 'You are an expert CEFR language exam designer.',
  user: 'Generate 13 A1 grammar questions in "en", one for each topic.',
};

// Only `get` is used by the provider, so a plain object stands in for NestJS's ConfigService.
function configWith(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

// Builds the envelope Gemini wraps its answer in: candidates[0].content.parts[0].text
function geminiReply(text?: string): Response {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
    status: 200,
  });
}

describe('GeminiProvider', () => {
  const fetchMock = vi.fn();

  // Replace the global fetch: no test ever reaches the network or spends tokens.
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  const provider = (values: Record<string, string> = { LLM_API_KEY: 'test-key' }) =>
    new GeminiProvider(configWith(values));

  it('fails before any request when LLM_API_KEY is missing', async () => {
    await expect(provider({}).generateStructured(PROMPT)).rejects.toThrow(
      'LLM_API_KEY is not defined',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the prompt to the configured model and asks for JSON', async () => {
    fetchMock.mockResolvedValueOnce(geminiReply('{"items":[]}'));

    await provider({ LLM_API_KEY: 'test-key', LLM_MODEL: 'gemini-test' }).generateStructured(
      PROMPT,
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/models/gemini-test:generateContent');
    expect(url).toContain('key=test-key');
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body);
    expect(body.system_instruction.parts[0].text).toBe(PROMPT.system);
    expect(body.contents[0]).toEqual({ role: 'user', parts: [{ text: PROMPT.user }] });
    // Without this, Gemini may answer in prose and every batch would fail validation.
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('falls back to the default model when LLM_MODEL is empty', async () => {
    fetchMock.mockResolvedValueOnce(geminiReply('{}'));

    await provider({ LLM_API_KEY: 'test-key', LLM_MODEL: '' }).generateStructured(PROMPT);

    expect(fetchMock.mock.calls[0][0]).toContain('/models/gemini-3.1-flash-lite:generateContent');
  });

  it('omits system_instruction when the prompt has no system part', async () => {
    fetchMock.mockResolvedValueOnce(geminiReply('{}'));

    await provider().generateStructured({ user: PROMPT.user });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('system_instruction');
  });

  // A thrown error is what makes QuestionGenerationService retry, then fall back.
  it('throws with the HTTP status when Gemini answers with an error', async () => {
    fetchMock.mockResolvedValueOnce(new Response('quota exceeded', { status: 429 }));

    await expect(provider().generateStructured(PROMPT)).rejects.toThrow(
      'Gemini API error (429): quota exceeded',
    );
  });

  it('throws when the response carries no text', async () => {
    fetchMock.mockResolvedValueOnce(geminiReply(undefined));

    await expect(provider().generateStructured(PROMPT)).rejects.toThrow(
      'Gemini returned no response text',
    );
  });

  it('parses plain JSON', async () => {
    fetchMock.mockResolvedValueOnce(geminiReply('{"items":[{"question":"Q"}]}'));

    await expect(provider().generateStructured(PROMPT)).resolves.toEqual({
      items: [{ question: 'Q' }],
    });
  });

  // Models sometimes wrap JSON in a markdown fence despite the prompt forbidding it.
  it('strips a ```json fence before parsing', async () => {
    fetchMock.mockResolvedValueOnce(geminiReply('```json\n{"items":[]}\n```'));

    await expect(provider().generateStructured(PROMPT)).resolves.toEqual({ items: [] });
  });

  // Truncated or chatty output must throw here, never reach the schema as a half-object.
  it('throws on text that is not valid JSON', async () => {
    fetchMock.mockResolvedValueOnce(geminiReply('Here are your questions: {"items": ['));

    await expect(provider().generateStructured(PROMPT)).rejects.toThrow(SyntaxError);
  });
});
