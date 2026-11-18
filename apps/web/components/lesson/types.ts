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

/** A gender, as an answer and a gender row carry it. */
export type Gender = NonNullable<Extract<Answer, { text: string; token?: never }>['gender']>;

/**
 * A hold an item puts on the player's main button (#147), shown beside it:
 * - `block`: the button stays disabled ("Flip every card to continue.");
 * - `warn`: the first press only shows the message, the second goes on
 *   ("Type the article before the word.").
 * The countdown at zero ignores both.
 */
export interface Gate {
  message: string;
  mode: 'block' | 'warn';
}

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
   * Sets or clears a hold on the main button, by a key the item picks (a
   * ref). Stable across renders; useGate (gate.ts) sets and clears it.
   */
  onGate: (key: string, gate: Gate | null) => void;
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

export interface KindParts {
  /** The lesson kind these parts play: a lesson of a kind with no parts cannot start. */
  kind: LessonKind;
  renderers: ItemRenderers;
  startFields: StartField[];
}
