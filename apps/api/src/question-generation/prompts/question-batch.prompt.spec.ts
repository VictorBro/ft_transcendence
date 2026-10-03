import { QUESTION_CATEGORIES, READING_TOPIC, TOPICS, VOCABULARY_TOPICS } from '@ft/shared';
import { describe, expect, it } from 'vitest';

import { buildQuestionBatchPrompt } from './question-batch.prompt';

describe('buildQuestionBatchPrompt', () => {
  it.each(QUESTION_CATEGORIES)(
    'gives %s the language, the level and the rules every batch shares',
    (category) => {
      const { system } = buildQuestionBatchPrompt({ lang: 'de', level: 'B2', category });

      expect(system).toContain(`for category "${category}", in language "de", at CEFR level B2.`);
      expect(system).toContain('- Everything (passages, questions, options) is in "de".');
      expect(system).toContain(
        '- Each question has 4 different options, and "answer" repeats the correct one verbatim. Exactly one option is correct;',
      );
      expect(system).toContain('- No two questions in the batch may be the same.');
    },
  );

  it('asks for one grammar question per topic, each with a blank', () => {
    const { system, user } = buildQuestionBatchPrompt({
      lang: 'fr',
      level: 'B1',
      category: 'grammar',
    });

    expect(system).toContain('Write 13 multiple-choice placement questions for category "grammar"');
    expect(system).toContain('a single blank written "___"');
    expect(system).toContain(`none repeated or skipped: ${TOPICS.join(', ')}.`);
    expect(system).toContain('TOPIC CALIBRATION');
    expect(user).toBe('Write 13 B1 grammar questions in "fr", one per topic.');
  });

  // The old prompt filed vocabulary under the grammar topics, and got grammar back.
  it('asks vocabulary for words and phrases, not grammar, under the vocabulary topics only', () => {
    const { system, user } = buildQuestionBatchPrompt({
      lang: 'de',
      level: 'A2',
      category: 'vocabulary',
    });

    expect(system).toContain('category "vocabulary"');
    expect(system).toContain('Test vocabulary, not grammar: collocations, word choice');
    expect(system).toContain(
      'Options that differ only in inflection (tense, person, number, case, agreement) make a grammar question: avoid them.',
    );
    expect(system).toContain(`closest fit among: ${VOCABULARY_TOPICS.join(', ')}.`);
    expect(system).toContain('VOCABULARY CALIBRATION');
    expect(system).not.toContain('subordinate_clauses');
    expect(user).toBe('Write 10 A2 vocabulary questions in "de".');
  });

  it('asks for reading questions on passages of their own, under the reading topic', () => {
    const { system, user } = buildQuestionBatchPrompt({
      lang: 'en',
      level: 'C1',
      category: 'reading',
    });

    expect(system).toContain('Write 5 multiple-choice placement questions for category "reading"');
    expect(system).toContain('its own standalone "readText" passage of 25 to 100 words');
    expect(system).toContain(`"topic" is always "${READING_TOPIC}"`);
    expect(system).toContain('READING CALIBRATION');
    expect(user).toBe(
      'Write 5 C1 reading comprehension questions in "en", each with its own passage.',
    );
  });

  it.each([
    ['A1', undefined, 'A2'],
    ['B1', 'A2', 'B2'],
    ['C2', 'C1', undefined],
  ] as const)('bounds %s by the levels around it', (level, lower, upper) => {
    const { system } = buildQuestionBatchPrompt({ lang: 'en', level, category: 'grammar' });

    expect(system.includes(`clearly harder than typical ${lower} material`)).toBe(!!lower);
    expect(system.includes(`associated with ${upper} or above`)).toBe(!!upper);
    expect(system).not.toMatch(/clearly harder than typical undefined|with undefined or above/);
  });

  // The server owns the level and the time limit, and the schema owns the format.
  it.each(QUESTION_CATEGORIES)(
    'leaves the level, the clock and the format out of %s',
    (category) => {
      const { system } = buildQuestionBatchPrompt({ lang: 'en', level: 'B2', category });

      expect(system).not.toMatch(/timeLimitS|seconds|"level"|```/);
      expect(system).not.toMatch(/[\u2013\u2014]/);
    },
  );
});
