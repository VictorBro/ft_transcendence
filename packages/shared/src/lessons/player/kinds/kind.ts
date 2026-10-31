import type { Locale } from '../../../schemas/locale';
import type { LocalizedText, NativeText } from '../../schemas/artifactCommon';
import type { Brief, LessonContent } from '../../schemas/artifacts';
import type { Item, LessonPlan, PlanPage, PlanUnit } from '../plan';

/**
 * What one lesson kind plugs into the player. Each kind has one module
 * (vocabulary.ts, grammar.ts…), and the shared files (plan.ts,
 * outline.ts, score.ts) only call these hooks: they never test the kind
 * themselves. A fifth kind adds a module and nothing else.
 */

/** The rules of one item type that are not its units. */
export interface ItemTraits<I extends Item = Item> {
  /**
   * What the learner must turn or show before Continue: the cards of a
   * flashcard item, the lines of a dialogue after the first. Internal
   * ids; the page view sends them as refs. Empty for most types.
   */
  reveals: (item: I) => string[];
  /**
   * A practice page whose items all skip it goes straight on, with a
   * green flash, when every answer is right: the feedback would only
   * repeat the answers. Matching boards and items with one answer do;
   * pages with several answers per item (a gender table) keep it.
   */
  skipFeedbackWhenRight: boolean;
}

/** A part of the exam shown on its own in the results. */
export type ExamPart = 'translation' | 'replies' | 'dialogue';

/** The start-page facts of a lesson, besides its title and objective. */
export interface StartFacts {
  /** Vocabulary: the number of words. */
  words?: number;
  /** Grammar: the verbs the lesson introduces. */
  newVerbs?: { infinitive: string; translation: NativeText }[];
  /** Functions: the situation and the two roles. */
  situation?: LocalizedText;
  roles?: string[];
}

/** Builds the units of one item; `id` makes the unit ids (`<pageId>/<itemId><suffix>`). */
export type UnitBuilder<I extends Item> = (item: I, id: (suffix?: string) => string) => PlanUnit[];

export interface KindModule<
  B extends Brief = Brief,
  C extends LessonContent = LessonContent,
  I extends Item = Item,
> {
  /** The playable lesson: the content file, or what the kind builds from its brief. */
  content: (brief: B, content: C | null) => C;
  /** The units of the kind's items, in the attempt's mother tongue; none for a presentation item. */
  units: (brief: B, content: C, motherTongue: Locale) => UnitBuilder<I>;
  /** Reorders, drops or relabels pages once their units are built. */
  arrange: (pages: PlanPage[]) => PlanPage[];
  /** The traits of each of the kind's item types. */
  traits: { [T in I['type']]: ItemTraits<Extract<I, { type: T }>> };
  /**
   * The outline section of a page before the exam: a key, and the title
   * the section takes. Without a title, the section is named by the
   * titles of its points, joined with " · ".
   */
  section: (page: PlanPage, plan: LessonPlan) => { key: string; title?: LocalizedText };
  /** The title of a presentation page's point in the outline; its step label by default. */
  pointTitle: (page: PlanPage) => LocalizedText;
  /** The start-page facts. */
  start: (brief: B, plan: LessonPlan) => StartFacts;
  /** The results part of an exam page, when the kind splits its exam. */
  examPart: (page: PlanPage) => ExamPart | undefined;
}

/** The traits of a type with nothing to reveal. */
export const answers = (skipFeedbackWhenRight: boolean) => ({
  reveals: () => [],
  skipFeedbackWhenRight,
});

/**
 * A part of the lesson an item names by id. A missing one throws instead
 * of falling back to the id, which would reach the browser as text (the
 * validators already reject such a lesson).
 */
export function known<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`${what} is not in the lesson`);
  return value;
}

/** No units: a presentation item. */
export const NO_UNITS: PlanUnit[] = [];
