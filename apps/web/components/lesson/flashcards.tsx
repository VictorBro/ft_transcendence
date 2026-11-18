'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { useGate } from './gate';
import type { AnswerProps, Ref } from './types';

/*
 * B3, the flashcards (#147): a grid of cards, each turned with a click.
 * The front asks (the word in the mother tongue), the back answers. Every
 * card is turned once before Continue: the player's button waits until
 * then. Reading (#148) and functions (#149) fill the faces with their own
 * content.
 */

export interface Card {
  ref: Ref;
  /** The front's text, which also names the card's turn button. */
  label: string;
  front: ReactNode;
  back: ReactNode;
}

const TURN_ICON = (
  <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true">
    <path
      d="M4.5 9a5.5 5.5 0 1 1 1.6 4.4M4.5 9V5M4.5 9h4"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function Flashcards({ cards, onGate }: Pick<AnswerProps, 'onGate'> & { cards: Card[] }) {
  const t = useTranslations('Lesson');
  // Turned now, and turned once: a card turned back still counts.
  const [up, setUp] = useState<ReadonlySet<Ref>>(new Set());
  const [seen, setSeen] = useState<ReadonlySet<Ref>>(new Set());
  // The state can outlive a page (the same renderer at the same place): only this page's cards count.
  const turned = cards.filter((card) => seen.has(card.ref)).length;

  useGate(
    onGate,
    `flashcards:${cards[0]?.ref ?? ''}`,
    turned < cards.length ? { message: t('flipEvery'), mode: 'block' } : null,
  );

  function turn(ref: Ref) {
    setUp((current) => {
      const next = new Set(current);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
    setSeen((current) => (current.has(ref) ? current : new Set(current).add(ref)));
  }

  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="text-slate-400">
        {t('cardsTurned', { turned, total: cards.length })}
      </p>
      <ul className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => {
          const back = up.has(card.ref);
          return (
            <li
              key={card.ref}
              data-card={card.ref}
              data-turned={back}
              className={`relative min-h-40 rounded-xl border bg-slate-950 transition-colors ${
                back ? 'border-indigo-400/70' : 'border-slate-700'
              }`}
            >
              {back ? (
                <div className="flex h-full flex-col gap-3 p-5 pr-16">{card.back}</div>
              ) : (
                // A click anywhere on the front turns it too; the keyboard has the button.
                <div
                  onClick={() => turn(card.ref)}
                  className="flex h-full min-h-40 cursor-pointer items-center rounded-xl p-5 pr-16 text-xl font-semibold text-slate-100 hover:bg-slate-900"
                >
                  {card.front}
                </div>
              )}
              {/* One button for both faces, so the focus stays on it as the card turns. */}
              <button
                type="button"
                aria-label={t('turnCard', { text: card.label })}
                aria-pressed={back}
                onClick={() => turn(card.ref)}
                className={`absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-full border bg-slate-900 text-slate-200 hover:text-white ${
                  back ? 'border-indigo-400/60' : 'border-slate-700'
                }`}
              >
                {TURN_ICON}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
