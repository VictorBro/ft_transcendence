import type { SupportedKind } from '../../schemas/artifacts';
import type { Item, PlanPage } from '../plan';
import { functions } from './functions';
import { grammar } from './grammar';
import type { ItemTraits, KindModule } from './kind';
import { reading } from './reading';
import { vocabulary } from './vocabulary';

/**
 * The kind modules by kind. The only place that maps a kind to its code:
 * everything else asks kindModule.
 */
const KINDS = { vocabulary, grammar, functions, reading } as const;

/**
 * The module of a kind, typed for any lesson. Each module only ever sees
 * its own kind's brief, content and items: buildPlan passes it the
 * lesson it was picked for.
 */
export function kindModule(kind: SupportedKind): KindModule {
  return KINDS[kind] as unknown as KindModule;
}

/** The traits of an item type, whatever its kind. */
export function itemTraits(item: Item): ItemTraits {
  for (const module of Object.values(KINDS)) {
    const traits = (module.traits as Record<string, ItemTraits>)[item.type];
    if (traits) return traits;
  }
  throw new Error(`No traits for item type ${item.type}`);
}

/**
 * true when a practice page goes straight on once every answer is right:
 * every item on it skips the feedback (see ItemTraits).
 */
export function skipsFeedbackWhenRight(page: PlanPage): boolean {
  return (
    page.role === 'practice' &&
    page.items.length > 0 &&
    page.items.every((item) => itemTraits(item).skipFeedbackWhenRight)
  );
}

/** What the learner must reveal on a page before Continue, by item (internal ids). */
export function requiredReveals(page: PlanPage): { itemId: string; keys: string[] }[] {
  return page.items
    .map((item) => ({ itemId: item.itemId, keys: itemTraits(item).reveals(item) }))
    .filter((r) => r.keys.length > 0);
}

export type { ExamPart, ItemTraits, KindModule, StartFacts } from './kind';
