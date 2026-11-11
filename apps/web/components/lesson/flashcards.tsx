'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Language } from '@ft/shared';

import { ListenButton } from './speech';
import type { Hold, Ref } from './types';

/** One card of B3: the mother tongue on the front, the course language on the back. */
export interface Flashcard {
  ref: Ref;
  /** The front: the translations. */
  front: string;
  /** The back: the word in the course language, its teaching form. */
  text: string;
  /** An example sentence on the back, and its translation. */
  example?: { text: string; translation: string };
}

/**
 * B3, the flashcards (#147): recall each word from its translation, then
 * turn the card to check it. Every card is turned at least once before
 * Continue: the page holds its button until then. A turned card can be
 * turned back; it stays counted.
 */
export function Flashcards({
  cards,
  lang,
  hold,
}: {
  cards: Flashcard[];
  lang: Language;
  hold: (key: string, hold: Hold | null) => void;
}) {
  const t = useTranslations('Lesson');
  // Turned once: counts. Showing its back now: the face on screen.
  const [turned, setTurned] = useState<ReadonlySet<Ref>>(new Set());
  const [back, setBack] = useState<ReadonlySet<Ref>>(new Set());
  const key = cards.map((c) => c.ref).join(',');
  const done = cards.every((c) => turned.has(c.ref));

  useEffect(() => {
    hold(`cards:${key}`, done ? null : { kind: 'block', message: t('flipEveryCard') });
    return () => hold(`cards:${key}`, null);
  }, [hold, key, done, t]);

  function flip(ref: Ref) {
    setTurned((s) => new Set(s).add(ref));
    setBack((s) => {
      const next = new Set(s);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
  }

  return (
    <section className="lesson-item flex flex-col gap-5">
      <p className="text-slate-400" role="status">
        {t('cardsTurned', {
          count: cards.filter((c) => turned.has(c.ref)).length,
          total: cards.length,
        })}
      </p>
      <ul className="lesson-flashcards">
        {cards.map((card) => {
          const showing = back.has(card.ref);
          return (
            <li
              key={card.ref}
              data-card={card.ref}
              data-face={showing ? 'back' : 'front'}
              className={`lesson-flashcard ${turned.has(card.ref) ? 'is-turned' : ''}`}
            >
              <button
                type="button"
                className="lesson-flashcard-turn"
                aria-label={t('turnCard', { text: showing ? card.text : card.front })}
                aria-pressed={showing}
                onClick={() => flip(card.ref)}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                  <path
                    d="M5 7.5A6 6 0 1 1 4.2 12M5 3.5v4h4"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {showing ? (
                <div className="lesson-flashcard-face">
                  <p className="flex flex-wrap items-center gap-3">
                    <span lang={lang} className="lesson-flashcard-word">
                      {card.text}
                    </span>
                    <ListenButton text={card.text} lang={lang} />
                  </p>
                  {card.example ? (
                    <p className="lesson-flashcard-example">
                      <ListenButton text={card.example.text} lang={lang} size="sm" />
                      <span>
                        <span lang={lang}>{card.example.text}</span>
                        {card.example.translation ? (
                          <span className="text-slate-400"> – {card.example.translation}</span>
                        ) : null}
                      </span>
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="lesson-flashcard-face">
                  <p className="lesson-flashcard-word">{card.front}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
