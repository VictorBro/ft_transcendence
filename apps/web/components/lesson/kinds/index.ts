import type { ItemRenderers, KindParts, StartField } from '../types';
import { grammarRenderers } from './grammar';
import { NewVerbs } from './grammar-start';

/**
 * Every kind's parts, merged: #147 to #149 add their own here, next to
 * grammar's, and change nothing else in the host.
 */
const KINDS: KindParts[] = [{ renderers: grammarRenderers, startFields: [NewVerbs] }];

export const ITEM_RENDERERS: ItemRenderers = Object.assign({}, ...KINDS.map((k) => k.renderers));
export const START_FIELDS: StartField[] = KINDS.flatMap((k) => k.startFields);
