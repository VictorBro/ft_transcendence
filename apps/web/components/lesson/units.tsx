'use client';

import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { pick } from '@/lib/localized';
import { FeedbackNote, UnitControl, type Outcome } from './controls';
import type { AnswerProps, Localized, UnitView } from './types';

/**
 * The units of an item one under the other, each with its control and,
 * once checked, its correction. `data-unit` names the unit by its ref,
 * which says nothing about the answer.
 */
export function Units({
  units,
  lang,
  answers,
  onAnswer,
  feedback,
  locked,
}: AnswerProps & { units: UnitView[] }) {
  return (
    <div className="flex flex-col gap-5">
      {units.map((unit) => {
        const note = feedback?.get(unit.ref);
        return (
          <div key={unit.ref} data-unit={unit.ref} className="flex flex-col gap-2">
            <UnitControl
              unit={unit}
              value={answers[unit.ref]}
              onChange={(answer) => onAnswer(unit.ref, answer)}
              feedback={note}
              locked={locked}
              lang={lang}
            />
            {note ? (
              unit.kind === 'text' ? null : unit.kind === 'choice' ? (
                <span className="sr-only" role="status" data-outcome={note.outcome}>
                  <OutcomeLabel outcome={note.outcome} />
                </span>
              ) : (
                <FeedbackNote feedback={note} lang={lang} />
              )
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function OutcomeLabel({ outcome }: { outcome: Outcome }) {
  const t = useTranslations('Lesson');
  return t(
    outcome === 'fully_correct'
      ? 'correct'
      : outcome === 'orthography_only'
        ? 'halfPoint'
        : 'incorrect',
  );
}

/** An item's hint, in the interface language. */
export function Hint({ hint }: { hint: Localized | null }) {
  const t = useTranslations('Lesson');
  const locale = useLocale();
  if (hint === null) return null;
  return <p className="text-sm text-slate-400">{t('hint', { hint: pick(hint, locale) })}</p>;
}

/** An item group inside the player's shared task card. */
export function ItemCard({ children }: { children: ReactNode }) {
  return <section className="lesson-item flex flex-col gap-5">{children}</section>;
}
