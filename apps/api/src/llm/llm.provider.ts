import type { QuestionCategory } from '@ft/shared';
import type { z } from 'zod';

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

/** What a call is for: tags the logs. */
export type LlmPurpose = `question-batch:${QuestionCategory}`;

export interface StructuredRequest<S extends z.ZodType> {
  purpose: LlmPurpose;
  system: string;
  user: string;
  schema: S;
}

export interface LlmProvider {
  /** Resolves with the reply parsed by `schema`, or rejects with an LlmError. */
  generateStructured<S extends z.ZodType>(request: StructuredRequest<S>): Promise<z.output<S>>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    /** Whether sending the same request again may succeed. */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
