import type { QuestionCategory } from '@ft/shared';
import type { z } from 'zod';

// The name other classes use to ask Nest for the LLM provider.
// It is a Symbol, a unique value that still exists at runtime,
// because the LlmProvider interface is erased when the code is compiled.
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

/**
 * What a call is for: tags the logs.
 * It is a text with a fixed start and a category after it, for example
 * "question-batch:grammar". TypeScript builds every allowed value from
 * QuestionCategory, so a typo like "question-batch:gramar" does not compile.
 */
export type LlmPurpose = `question-batch:${QuestionCategory}`;

/**
 * What we send to the LLM.
 * An interface is a list of fields and their types: it describes the shape of
 * an object. It exists only while compiling, to catch mistakes.
 *
 * S is a type that is filled in at each call. "extends z.ZodType" means S
 * must be a Zod schema, so the schema field always has the methods we need
 * (like safeParse). The reply type is taken from this schema.
 */
export interface StructuredRequest<S extends z.ZodType> {
  purpose: LlmPurpose;
  /** The rules and the role of the model, for example "You are an exam designer". */
  system: string;
  /** The precise request, for example "Write 13 A1 grammar questions". */
  user: string;
  /** Describes the JSON we expect back, and checks the reply against it. */
  schema: S;
}

/**
 * The contract every LLM provider must follow (Gemini, Fixture...).
 * The rest of the code only knows this interface, so it does not care which
 * provider is behind it. To add a new provider, write a class that
 * "implements LlmProvider" and the compiler checks the method is there.
 */
export interface LlmProvider {
  /**
   * Sends the request to the LLM and gives back the reply as a checked object.
   *
   * <S extends z.ZodType> is filled in by TypeScript from request.schema, for
   * each call. So a grammar schema gives a grammar result type, and a reading
   * schema gives a reading result type, with no type written by hand.
   *
   * Promise<z.output<S>> means: the answer comes later (use await), and it has
   * the shape described by the schema, after the reply was checked against it.
   *
   * Resolves with the reply parsed by `schema`, or rejects with an LlmError.
   */
  generateStructured<S extends z.ZodType>(request: StructuredRequest<S>): Promise<z.output<S>>;
}

/**
 * The error a provider throws when a call fails.
 * It is a real class (it exists at runtime), so we can test it with
 * "error instanceof LlmError". It extends Error, so it has a message and a
 * stack like any error.
 *
 * "retryable" tells the caller if it is worth trying again. A network problem
 * or a rate limit may work next time (true). A blocked prompt gives the same
 * result every time (false). The provider knows best, so it decides.
 */
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
