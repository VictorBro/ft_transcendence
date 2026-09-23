import { describe, expect, it } from 'vitest';
import { GeneratedBatchSchema } from '@ft/shared';
import { FixtureProvider } from './fixture.provider';

describe('FixtureProvider', () => {
  it('returns a deterministic batch of 5 questions strictly valid against GeneratedBatchSchema', async () => {
    const provider = new FixtureProvider();
    const batch = await provider.generateStructured({
      system: 'dummy system prompt',
      user: 'dummy user prompt',
    });

    const parsed = GeneratedBatchSchema.safeParse(batch);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      expect(parsed.data.items).toHaveLength(5);
      for (const item of parsed.data.items) {
        expect(item.options).toHaveLength(4);
        expect(new Set(item.options).size).toBe(4);
        expect(item.options).toContain(item.answer);
        expect(item.timeLimitS).toBeGreaterThan(0);
      }

      // Check that topics are distinct in the fixture batch
      const topics = parsed.data.items.map((i) => i.topic);
      expect(new Set(topics).size).toBe(5);
    }
  });
});
