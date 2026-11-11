import type { ComponentType } from 'react';
import type { Language, LessonKind, lessons } from '@ft/shared';

export type ItemView = lessons.player.ItemView;
export type ItemViewType = lessons.player.ItemViewType;
export type UnitView = lessons.player.UnitView;
export type UnitFeedback = lessons.player.UnitFeedback;
export type Answer = lessons.player.Answer;
export type Ref = lessons.player.Ref;
export type LessonOutline = lessons.player.LessonOutline;
export type Localized = lessons.player.LocalizedTextView;

/**
 * What the player hands every unit and item: the drafts, the feedback
 * once checked, and whether the answers can still change.
 */
export interface AnswerProps {
  /** The course language, for the lang attribute of its texts. */
  lang: Language;
  /** The drafts of the page, by unit ref. */
  answers: Readonly<Record<Ref, Answer | undefined>>;
  /** Sets or clears one unit's draft. */
  onAnswer: (ref: Ref, answer: Answer | undefined) => void;
  /** The feedback of a checked practice page, by unit ref; null before, and on the exam. */
  feedback: ReadonlyMap<Ref, UnitFeedback> | null;
  /** No change any more: a request is running, the page was checked, or its time ran out. */
  locked: boolean;
  /**
   * Holds the page's main button back, under a key of the item's own;
   * null lets it go. A `block` disables it (every flashcard turned first);
   * a `nudge` lets the first press through only to show `nudged`, and the
   * second one sends (the article note of the translation exam).
   */
  hold: (key: string, hold: Hold | null) => void;
  /** The first press found a nudge: the items show their notes. */
  nudged: boolean;
  /** What the items of one page share (the skim of a reading page), cleared with the page. */
  shared: Readonly<Record<string, unknown>>;
  share: (key: string, value: unknown) => void;
}

/** What holds the main button of a page back; see AnswerProps.hold. */
export interface Hold {
  kind: 'block' | 'nudge';
  /** Shown beside the button while it holds; none for a hold the item explains itself. */
  message?: string;
}

export interface ItemProps<T extends ItemViewType = ItemViewType> extends AnswerProps {
  item: Extract<ItemView, { type: T }>;
}

/**
 * The kind contract on the web side: a kind (#147 to #149) plugs in a
 * renderer per item type of its own, and fields of the lesson page. The
 * host only looks them up; it never asks which kind a lesson is.
 */
export type ItemRenderers = { [T in ItemViewType]?: ComponentType<ItemProps<T>> };

/** A block of the lesson page that shows one of the outline's kind fields, or nothing. */
export type StartField = ComponentType<{ outline: LessonOutline; lang: Language }>;

/**
 * A short fact of the lesson page, from the outline, in the Lesson
 * messages; null when the lesson has none.
 */
export type StartFact = (
  outline: LessonOutline,
  t: (key: string, values?: Record<string, string | number>) => string,
) => string | null;

export interface KindParts {
  /** The lesson kind these parts play: a lesson of a kind with no parts cannot start. */
  kind: LessonKind;
  renderers: ItemRenderers;
  startFields: StartField[];
  /** Short facts after the minutes on the lesson page ("About 14 minutes · 8 words"). */
  startFacts?: StartFact[];
}
