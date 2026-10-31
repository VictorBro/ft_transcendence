import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Brief, LessonContent } from '../schemas/artifacts';
import type { LessonSource } from './plan';

/**
 * The lessons the player tests run on, from packages/shared/test/fixtures,
 * one or more of each kind. Until the French A1 lessons land (#84), these
 * are PR #142's samples and the vocabulary test brief.
 *
 * Only tests import this file (`.testing.ts` is left out of the build).
 */
const FIXTURES = join(__dirname, '../../../test/fixtures');
const read = (path: string): unknown => JSON.parse(readFileSync(join(FIXTURES, path), 'utf8'));

/** Where each lesson lives: content/ (short test lessons) or samples/ (complete lessons). */
const FOLDER = {
  'fr-classroom-objects': 'content',
  'fr-verb-etre-present': 'samples',
  'fr-negation-ne-pas': 'samples',
  'fr-ordering-at-a-cafe': 'samples',
  'fr-greetings-and-goodbyes': 'samples',
  'fr-reading-a-text-message': 'samples',
} as const;
export type FixtureLesson = keyof typeof FOLDER;
export const FIXTURE_LESSONS = Object.keys(FOLDER) as FixtureLesson[];

/** One lesson of each kind. */
export const BY_KIND = {
  vocabulary: 'fr-classroom-objects',
  grammar: 'fr-verb-etre-present',
  functions: 'fr-ordering-at-a-cafe',
  reading: 'fr-reading-a-text-message',
} as const satisfies Record<Brief['kind'], FixtureLesson>;

/** A lesson as the API stores it: its brief, and its content file (null for vocabulary). */
export function fixtureLesson(id: FixtureLesson): LessonSource {
  const brief = read(`${FOLDER[id]}/briefs/${id}.json`) as Brief;
  const content =
    brief.kind === 'vocabulary'
      ? null
      : (read(`${FOLDER[id]}/lessons/${id}.json`) as LessonContent);
  return { brief, content };
}
