import type { LessonKind } from '@ft/shared';

import type { ItemRenderers, KindParts, StartField } from '../types';
import { grammarRenderers } from './grammar';
import { NewVerbs } from './grammar-start';

/**
 * Every kind's parts, merged: #147 to #149 add their own here, next to
 * grammar's, and change nothing else in the host.
 */
const KINDS: KindParts[] = [
  { kind: 'grammar', renderers: grammarRenderers, startFields: [NewVerbs] },
];

export const ITEM_RENDERERS: ItemRenderers = Object.assign({}, ...KINDS.map((k) => k.renderers));
export const START_FIELDS: StartField[] = KINDS.flatMap((k) => k.startFields);

/**
 * Whether the browser can play a lesson of this kind. The others stay
 * closed until their kind lands (#147 to #149): their items would only
 * show "cannot be shown yet", and the server would record a failed result.
 */
export function playable(kind: LessonKind): boolean {
  return KINDS.some((k) => k.kind === kind);
}
