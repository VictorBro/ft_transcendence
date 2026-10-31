import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Brief, LessonContent } from '../schemas/artifacts';
import type { LessonSource, PlanPage, PlanUnit } from './plan';
import { paths, type RefOf } from './redact';
import type { UnitResponse } from './score';
import type { Answer } from './view';

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

/** The API's ref (#145): HMAC-SHA256 of the path with the attempt's secret, base64url, 16 characters. */
export const refOf =
  (secret: string): RefOf =>
  (path) =>
    createHmac('sha256', secret).update(path).digest('base64url').slice(0, 16);

/** A response of the unit's kind, right, with a spelling slip, or wrong, as `how` says. */
export function responseFor(unit: PlanUnit, how: 'right' | 'slip' | 'wrong'): UnitResponse {
  switch (unit.kind) {
    case 'text': {
      const answer = unit.accepted.answers[0];
      return { text: how === 'wrong' ? 'xyz' : how === 'slip' ? answer.toUpperCase() : answer };
    }
    case 'choice':
      return {
        option:
          how === 'wrong'
            ? (unit.options.find((o) => !unit.correct.includes(o.id))?.id ?? unit.correct[0])
            : unit.correct[0],
      };
    case 'order':
      return {
        tokens: how === 'wrong' ? [...unit.acceptedOrders[0]].reverse() : unit.acceptedOrders[0],
      };
    case 'spot': {
      if (how === 'wrong')
        return { token: unit.tokens.find((t) => t.id !== unit.faultyTokenId)!.id, text: 'x' };
      const fix = unit.correction.accepted.answers[0];
      return { token: unit.faultyTokenId, text: how === 'slip' ? fix.toUpperCase() : fix };
    }
  }
}

/** The same response as the browser sends it: refs instead of ids. */
export function answerFor(
  page: PlanPage,
  unit: PlanUnit,
  response: UnitResponse,
  ref: RefOf,
): Answer {
  if ('option' in response)
    return { option: ref(paths.option(page, unit.itemId, response.option)) };
  if ('tokens' in response)
    return { tokens: response.tokens.map((t) => ref(paths.token(page, unit.itemId, t))) };
  if ('token' in response)
    return { token: ref(paths.token(page, unit.itemId, response.token)), text: response.text };
  return response;
}

/** A page's answers, keyed by unit ref, with `how` deciding each unit's response. */
export function pageAnswers(
  page: PlanPage,
  ref: RefOf,
  how: (unit: PlanUnit) => 'right' | 'slip' | 'wrong' | 'blank' = () => 'right',
): Record<string, Answer> {
  const out: Record<string, Answer> = {};
  for (const unit of page.units) {
    const h = how(unit);
    if (h !== 'blank')
      out[ref(paths.unit(unit))] = answerFor(page, unit, responseFor(unit, h), ref);
  }
  return out;
}
