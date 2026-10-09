import { FixtureProvider } from './fixture.provider';
import { GeminiProvider } from './gemini.provider';
import { LlmProvider } from './llm.provider';

const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';

/**
 * The settings we read from the .env file.
 * Record<keys, string> makes an object with these three keys, each one a string.
 * Partial<...> makes every key optional, because a setting can be missing
 * from the .env file. It is the same as writing:
 * { LLM_PROVIDER?: string; LLM_API_KEY?: string; LLM_MODEL?: string }
 */
type LlmEnv = Partial<Record<'LLM_PROVIDER' | 'LLM_API_KEY' | 'LLM_MODEL', string>>;

/**
 * Builds the LLM provider chosen by the settings.
 *
 * It takes one object (the settings), and the { ... } in the parameter list
 * opens it right away: each setting becomes a variable. "LLM_PROVIDER = 'fixture'"
 * is a default value, used when the setting is missing, so with no .env the
 * API starts with the Fixture provider (no network, no cost).
 *
 * It returns an LlmProvider: the caller gets "something that follows the
 * contract" and does not know if it is Gemini or Fixture.
 *
 * It throws on a bad setting. This function runs once, when the API starts
 * (see llm.module.ts), so a wrong setting stops the start with a clear message.
 * Without that, the problem would only show later, on the first restock,
 * while learners are using the app.
 */
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
