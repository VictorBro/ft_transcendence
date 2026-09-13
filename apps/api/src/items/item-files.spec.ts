import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ItemFileSchema,
  itemFileName,
  QUESTION_CATEGORIES,
  type QuestionCategory,
} from '@ft/shared';

/**
 * Validates the authored placement questions in content/items.
 *
 * A test rather than a standalone script: it runs in `make`, in `pnpm test` and
 * in CI with no extra wiring, and it fails for the person who wrote the item
 * instead of for whoever runs the seed a week later.
 *
 * It lives here rather than in @ft/shared because reading files needs Node, and
 * that package is a pure contract layer that the browser bundle also pulls in.
 * The api owns it because the api is what will seed these files.
 */

// vitest runs with the package as cwd.
const ITEMS_DIR = join(process.cwd(), '../..', 'content/items');

const read = (name: string): unknown => JSON.parse(readFileSync(join(ITEMS_DIR, name), 'utf8'));

const files = readdirSync(ITEMS_DIR).filter((name) => name.endsWith('.json'));

describe('content/items', () => {
  it('has at least one item file', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  describe.each(files)('%s', (name) => {
    const parsed = ItemFileSchema.safeParse(read(name));

    it('matches the item file schema', () => {
      // Printing the issues makes the failure actionable for an author who has
      // never seen a Zod error before.
      const issues = parsed.success
        ? ''
        : parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
      expect(issues, `${name} is not a valid item file:\n${issues}\n`).toBe('');
    });

    it('is named after the language and skill it declares', () => {
      if (!parsed.success) return;
      expect(name).toBe(itemFileName(parsed.data.lang, parsed.data.category));
    });
  });

  // Ids are permanent: PlacementAnswer rows point at them, so a duplicate would
  // make two different questions share a learner's exposure history.
  it('has no id used by more than one file', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];

    for (const name of files) {
      const parsed = ItemFileSchema.safeParse(read(name));
      if (!parsed.success) continue;
      for (const item of parsed.data.items) {
        const previous = seen.get(item.sourceId);
        if (previous !== undefined) {
          clashes.push(`${item.sourceId} in both ${previous} and ${name}`);
        }
        seen.set(item.sourceId, name);
      }
    }

    expect(clashes).toEqual([]);
  });

  it('reports which categories a language has not been authored for yet', () => {
    const byLanguage = new Map<string, Set<QuestionCategory>>();

    for (const name of files) {
      const parsed = ItemFileSchema.safeParse(read(name));
      if (!parsed.success) continue;
      const categories = byLanguage.get(parsed.data.lang) ?? new Set<QuestionCategory>();
      categories.add(parsed.data.category);
      byLanguage.set(parsed.data.lang, categories);
    }

    // Reported rather than asserted: a language part-way through authoring is a
    // normal state, and failing on it would block the person doing the work.
    for (const [lang, categories] of byLanguage) {
      const missing = QUESTION_CATEGORIES.filter((category) => !categories.has(category));
      if (missing.length > 0) {
        console.info(`content/items: ${lang} has no ${missing.join(', ')} file yet`);
      }
    }

    expect(byLanguage.size).toBeGreaterThan(0);
  });
});
