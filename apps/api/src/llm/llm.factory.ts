import { FixtureProvider } from './fixture.provider';
import { GeminiProvider } from './gemini.provider';
import { LlmProvider } from './llm.provider';

const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';

type LlmEnv = Partial<Record<'LLM_PROVIDER' | 'LLM_API_KEY' | 'LLM_MODEL', string>>;

/** Throws on a bad setting, so a misconfigured API fails at boot rather than on a restock. */
export function createLlmProvider({
  LLM_PROVIDER = 'fixture',
  LLM_API_KEY,
  LLM_MODEL,
}: LlmEnv): LlmProvider {
  switch (LLM_PROVIDER) {
    case 'fixture':
      return new FixtureProvider();
    case 'gemini':
      if (!LLM_API_KEY) throw new Error('LLM_PROVIDER=gemini needs LLM_API_KEY. See .env.example.');
      return new GeminiProvider({ apiKey: LLM_API_KEY, model: LLM_MODEL || DEFAULT_GEMINI_MODEL });
    default:
      throw new Error(
        `LLM_PROVIDER must be "fixture" or "gemini", got "${LLM_PROVIDER}". See .env.example.`,
      );
  }
}
