import { describe, expect, it } from 'vitest';
import { generatedBatchSchema, READING_BATCH_SIZE, TOPICS } from '@ft/shared';
import { buildGenerateQuestionsPrompt } from '../questions-generation/prompts/generate-questions.prompt';
import { FixtureProvider } from './fixture.provider';

describe('FixtureProvider', () => {
  const provider = new FixtureProvider();

  it.each(['grammar', 'vocabulary'] as const)(
    'returns one valid question per topic for %s',
    async (category) => {
      const batch = await provider.generateStructured(
        buildGenerateQuestionsPrompt({ lang: 'en', level: 'A1', category }),
      );

      const parsed = generatedBatchSchema(category).safeParse(batch);
      expect(parsed.success).toBe(true);
      expect(parsed.data?.items).toHaveLength(TOPICS.length);
    },
  );

  it('returns a valid reading batch, each question with its passage', async () => {
    const batch = await provider.generateStructured(
      buildGenerateQuestionsPrompt({ lang: 'en', level: 'A1', category: 'reading' }),
    );

    const parsed = generatedBatchSchema('reading').safeParse(batch);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.items).toHaveLength(READING_BATCH_SIZE);
  });
});
