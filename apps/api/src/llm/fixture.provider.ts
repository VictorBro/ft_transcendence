import { Injectable } from '@nestjs/common';
import { GeneratedBatch, READING_TOPIC } from '@ft/shared';
import { LlmProvider } from './llm.interface';

/** Grammar and vocabulary batch: exactly one question for each of the 13 TOPICS. */
export const FIXTURE_TOPIC_BATCH: GeneratedBatch = {
  items: [
    {
      level: 'A1',
      topic: 'nouns_and_determiners',
      question: 'She eats ___ apple.',
      options: ['an', 'a', 'the', 'some'],
      answer: 'an',
      timeLimitS: 30,
    },
    {
      level: 'A1',
      topic: 'pronouns',
      question: 'Give ___ the book, please.',
      options: ['me', 'I', 'my', 'mine'],
      answer: 'me',
      timeLimitS: 30,
    },
    {
      level: 'A1',
      topic: 'verbs_morphology',
      question: 'They ___ in Paris.',
      options: ['live', 'lives', 'living', 'lived'],
      answer: 'live',
      timeLimitS: 30,
    },
    {
      level: 'A1',
      topic: 'verb_usage',
      question: 'I ___ a shower every morning.',
      options: ['take', 'make', 'do', 'give'],
      answer: 'take',
      timeLimitS: 30,
    },
    {
      level: 'A1',
      topic: 'syntax_and_sentence_structure',
      question: '___ you like tea?',
      options: ['Do', 'Are', 'Is', 'Have'],
      answer: 'Do',
      timeLimitS: 30,
    },
    {
      level: 'A1',
      topic: 'subordinate_clauses',
      question: 'I stay home ___ it rains.',
      options: ['when', 'what', 'who', 'which'],
      answer: 'when',
      timeLimitS: 30,
    },
    {
      level: 'A1',
      topic: 'prepositions_and_case',
      question: 'The cat is ___ the table.',
      options: ['under', 'at', 'to', 'of'],
      answer: 'under',
      timeLimitS: 30,
    },
    {
      level: 'A1',
      topic: 'adjectives',
      question: 'It is a ___ day.',
      options: ['sunny', 'sun', 'sunshine', 'sunned'],
      answer: 'sunny',
      timeLimitS: 30,
    },
    {
      level: 'A1',
      topic: 'adverbs',
      question: 'She speaks very ___.',
      options: ['slowly', 'slow', 'slower', 'slowest'],
      answer: 'slowly',
      timeLimitS: 30,
    },
    {
      level: 'A1',
      topic: 'agreement',
      question: 'My brothers ___ tall.',
      options: ['are', 'is', 'am', 'be'],
      answer: 'are',
      timeLimitS: 30,
    },
    {
      level: 'A1',
      topic: 'negation',
      question: 'He ___ not like coffee.',
      options: ['does', 'do', 'is', 'has'],
      answer: 'does',
      timeLimitS: 30,
    },
    {
      level: 'A1',
      topic: 'comparison_and_quantity',
      question: 'An elephant is ___ than a dog.',
      options: ['bigger', 'big', 'biggest', 'more big'],
      answer: 'bigger',
      timeLimitS: 30,
    },
    {
      level: 'A1',
      topic: 'information_structure_and_pragmatics',
      question: '"Thank you!" "You are ___."',
      options: ['welcome', 'sorry', 'fine', 'right'],
      answer: 'welcome',
      timeLimitS: 30,
    },
  ],
};

/** Reading batch: READING_BATCH_SIZE questions, each with its own passage. */
export const FIXTURE_READING_BATCH: GeneratedBatch = {
  items: [
    {
      level: 'A1',
      topic: READING_TOPIC,
      readText: 'Tom has a red bike. He rides it to school every day.',
      question: 'How does Tom go to school?',
      options: ['By bike', 'By bus', 'On foot', 'By car'],
      answer: 'By bike',
      timeLimitS: 60,
    },
    {
      level: 'A1',
      topic: READING_TOPIC,
      readText: 'Anna is hungry. She opens the fridge, but it is empty.',
      question: 'What is in the fridge?',
      options: ['Nothing', 'Milk', 'Cheese', 'Apples'],
      answer: 'Nothing',
      timeLimitS: 60,
    },
    {
      level: 'A1',
      topic: READING_TOPIC,
      readText: 'The shop opens at nine and closes at six. On Sunday it is closed.',
      question: 'When is the shop closed?',
      options: ['On Sunday', 'On Monday', 'At nine', 'In the morning'],
      answer: 'On Sunday',
      timeLimitS: 60,
    },
    {
      level: 'A1',
      topic: READING_TOPIC,
      readText: 'My sister is twelve. I am two years older than her.',
      question: 'How old is the writer?',
      options: ['Fourteen', 'Twelve', 'Ten', 'Two'],
      answer: 'Fourteen',
      timeLimitS: 60,
    },
    {
      level: 'A1',
      topic: READING_TOPIC,
      readText: 'It is raining, so Paul takes his umbrella before he leaves.',
      question: 'Why does Paul take his umbrella?',
      options: ['It is raining', 'It is sunny', 'It is cold', 'It is late'],
      answer: 'It is raining',
      timeLimitS: 60,
    },
  ],
};

/**
 * FixtureProvider is a fake/mock LLM implementation.
 *
 * Why we use it:
 * - Deterministic: Returns the exact same valid batch every time.
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
   * Simulates structured generation by immediately returning a static, valid batch.
   * The provider contract only carries the prompt, so the category is read from the
   * system prompt: reading gets the reading batch, anything else the one-per-topic batch.
   */
  async generateStructured<T>(prompt: { system?: string; user: string }): Promise<T> {
    const isReading = prompt.system?.includes('category "reading"') ?? false;
    return (isReading ? FIXTURE_READING_BATCH : FIXTURE_TOPIC_BATCH) as T;
  }
}
