import { describe, expect, it } from 'vitest';
import { buildGenerateQuestionsPrompt } from './generate-questions.prompt';

describe('buildGenerateQuestionsPrompt', () => {
  it('builds a grammar prompt enforcing fill-in-the-blank, diverse topics, and no readText', () => {
    const { system, user } = buildGenerateQuestionsPrompt({
      lang: 'fr',
      level: 'B1',
      category: 'grammar',
    });

    expect(system).toContain('category "grammar"');
    expect(system).toContain('"___"');
    expect(system).toContain('Do NOT include "readText"');
    expect(system).toContain('Each of the 5 questions MUST have a DIFFERENT topic');
    expect(system).toContain('around 60 seconds');
    expect(system).toContain('language "fr"');
    expect(user).toContain('Generate 5 B1 grammar questions in "fr"');
  });

  it('builds a vocabulary prompt with 30s target for A1', () => {
    const { system, user } = buildGenerateQuestionsPrompt({
      lang: 'de',
      level: 'A1',
      category: 'vocabulary',
    });

    expect(system).toContain('category "vocabulary"');
    expect(system).toContain('Do NOT include "readText"');
    expect(system).toContain('around 30 seconds');
    expect(system).toContain('language "de"');
    expect(user).toContain('Generate 5 A1 vocabulary questions in "de"');
  });

  it('builds a reading prompt requiring standalone passages and fixed topic', () => {
    const { system, user } = buildGenerateQuestionsPrompt({
      lang: 'en',
      level: 'A2',
      category: 'reading',
    });

    expect(system).toContain('category "reading"');
    expect(system).toContain('"readText": string');
    expect(system).toContain(
      'Every question MUST have its own distinct, standalone "readText" passage',
    );
    expect(system).toContain('"topic": "information_structure_and_pragmatics"');
    expect(system).toContain('around 75-90 seconds');
    expect(user).toContain('Generate 5 A2 reading questions in "en"');
  });
});
