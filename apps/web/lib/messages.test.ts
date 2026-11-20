import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, CHALLENGES, ERROR_CODES } from '@ft/shared';

import en from '../messages/en.json';
import fr from '../messages/fr.json';
import de from '../messages/de.json';

/**
 * next-intl does not fail the build when a locale is missing a key: it falls
 * back to rendering the key path as a string at runtime, silently. This is the
 * only thing that would catch a missing translation before a human notices it
 * on a live page.
 */

type MessageTree = { [key: string]: string | MessageTree };

function keyPaths(tree: MessageTree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? [path] : keyPaths(value, path);
  });
}

const CATALOGUES: Record<string, MessageTree> = { en, fr, de };
const referenceKeys = keyPaths(en).sort();

describe.each(Object.entries(CATALOGUES))('messages/%s.json', (locale, tree) => {
  it('has exactly the same keys as en.json', () => {
    expect(keyPaths(tree).sort()).toEqual(referenceKeys);
  });

  /**
   * The other half of the contract asserted in @ft/shared's schemas.test.ts:
   * that package emits codes, this one owes each of them a sentence. A code
   * without a translation renders as its own path, "password.mismatch", under
   * the form field, in every language.
   */
  it('translates exactly the declared error codes', () => {
    expect(keyPaths(tree.Errors as MessageTree).sort()).toEqual([...ERROR_CODES].sort());
  });

  /**
   * Same contract for the gamification codes (#97): the API sends codes,
   * and each owes a title and a one-line rule. A code added to ACHIEVEMENTS
   * or CHALLENGES without its sentences fails here, not on the page.
   */
  it('gives every achievement and challenge code a title and a rule', () => {
    const gamification = tree.Gamification as MessageTree;
    const expected = (codes: readonly string[]) =>
      codes.flatMap((code) => [`${code}.rule`, `${code}.title`]).sort();

    expect(keyPaths(gamification.achievements as MessageTree).sort()).toEqual(
      expected(ACHIEVEMENTS.map((achievement) => achievement.code)),
    );
    expect(keyPaths(gamification.challenges as MessageTree).sort()).toEqual(expected(CHALLENGES));
  });

  it('has no empty translation', () => {
    for (const path of keyPaths(tree)) {
      const value = path.split('.').reduce<unknown>((node, segment) => {
        return (node as MessageTree)[segment];
      }, tree);
      expect(typeof value === 'string' && value.trim().length > 0, `${locale}: ${path}`).toBe(true);
    }
  });
});
