import type { LessonKind } from '@ft/shared';

import type { ItemRenderers, KindParts, StartFact, StartField } from '../types';
import { functionsRenderers } from './functions';
import { Situation } from './functions-start';
import { grammarRenderers } from './grammar';
import { NewVerbs } from './grammar-start';
import { vocabularyRenderers } from './vocabulary';
import { wordCount } from './vocabulary-start';

/**
 * Every kind's parts, merged: #147 to #149 add their own here, next to
 * grammar's, and change nothing else in the host.
 */
const KINDS: KindParts[] = [
  { kind: 'grammar', renderers: grammarRenderers, startFields: [NewVerbs] },
  {
    kind: 'vocabulary',
    renderers: vocabularyRenderers,
    startFields: [],
    startFacts: [wordCount],
  },
  { kind: 'functions', renderers: functionsRenderers, startFields: [Situation] },
];

export const ITEM_RENDERERS: ItemRenderers = Object.assign({}, ...KINDS.map((k) => k.renderers));
export const START_FIELDS: StartField[] = KINDS.flatMap((k) => k.startFields);
export const START_FACTS: StartFact[] = KINDS.flatMap((k) => k.startFacts ?? []);

/**
 * Whether the browser can play a lesson of this kind. The others stay
 * closed until their kind lands (#147 to #149): their items would only
 * show "cannot be shown yet", and the server would record a failed result.
 */
export function playable(kind: LessonKind): boolean {
  return KINDS.some((k) => k.kind === kind);
}
