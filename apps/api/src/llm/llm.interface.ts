/**
 * Injection token for NestJS.
 * TypeScript interfaces vanish at runtime, so NestJS needs a concrete
 * value (like a Symbol) to register and inject the chosen provider.
 */
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

/**
 * Universal contract for any LLM implementation (Gemini, Fixture, etc.).
 *
 * @example
 * ```ts
 * const item = await llmProvider.generateStructured<GeneratedItem>({
 *   system: 'You are an exam generator. Output strictly valid JSON.',
 *   user: 'Generate an A1 French grammar question on nouns_and_determiners.',
 * });
 * console.log(item.question); // "Je mange ___ pomme."
 * console.log(item.options);  // ["une", "un", "des", "le"]
 * ```
 */
export interface LlmProvider {
  /**
   * Generates a structured JSON object according to a prompt.
   *
   * @template T The expected return type (e.g. GeneratedItem), chosen by the caller.
   * @param prompt The instructions sent to the model:
   *   - system: (optional) Global persona, rules, or context (e.g. "You are an expert tutor").
   *   - user: The specific request (e.g. "Generate a B1 grammar question on past tense").
   *   (Other options like temperature, schema, etc. can be added later if needed).
   */
  generateStructured<T>(prompt: { system?: string; user: string }): Promise<T>;
}
