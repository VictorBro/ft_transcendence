import { Injectable } from '@nestjs/common';
import { GeneratedItem } from '@ft/shared';
import { LlmProvider } from './llm.interface';

/**
 * FixtureProvider is a fake/mock LLM implementation.
 *
 * Why we use it:
 * - Deterministic: Returns the exact same valid question every time.
 * - Zero network: No HTTP requests, no API latency, no network failures.
 * - Free CI & Local dev: Allows all tests and features to be developed without
 *   spending tokens or requiring a secret Google API key.
 *
 * What is `@Injectable()`?
 * - A NestJS decorator marking this class as a provider that NestJS's
 *   dependency injection container can instantiate and inject into other services.
 *
 * What does `implements LlmProvider` mean?
 * - It forces this class to respect the `LlmProvider` contract. If any required
 *   method is missing or has the wrong signature, TypeScript will throw a compile error.
 */
@Injectable()
export class FixtureProvider implements LlmProvider {
  /**
   * Simulates structured generation by immediately returning a static, valid GeneratedItem.
   */
  async generateStructured<T>(_prompt: { system?: string; user: string }): Promise<T> {
    const fakeItem: GeneratedItem = {
      level: 'A1',
      topic: 'nouns_and_determiners',
      question: 'She eats ___ apple.',
      options: ['an', 'a', 'the', 'some'],
      answer: 'an',
      timeLimitS: 30,
    };

    // `as T` tells TypeScript to trust that this fake item matches the expected generic type T.
    return fakeItem as T;
  }
}
