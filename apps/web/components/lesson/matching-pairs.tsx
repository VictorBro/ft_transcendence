'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';

import { outcomeTone } from './controls';
import type { AnswerProps, Ref, UnitView } from './types';

type ChoiceUnit = Extract<UnitView, { kind: 'choice' }>;
type Point = { x: number; y: number };
type Endpoints = { left: Record<Ref, Point>; right: Record<Ref, Point> };

const curve = (from: Point, to: Point) => {
  const bend = Math.max(24, Math.abs(to.x - from.x) / 2);
  return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`;
};

/** Two editable columns: curves on desktop, matching numbered badges on phones. */
export function MatchingPairs({
  units,
  lang,
  answers,
  onAnswer,
  feedback,
  locked,
}: AnswerProps & { units: ChoiceUnit[] }) {
  const t = useTranslations('Lesson');
  const options = units[0]?.options ?? [];
  const frame = useRef<HTMLDivElement>(null);
  const left = useRef(new Map<Ref, HTMLButtonElement>());
  const right = useRef(new Map<Ref, HTMLButtonElement>());
  const [selected, setSelected] = useState<{ side: 'left' | 'right'; ref: Ref } | null>(null);
  const [pointer, setPointer] = useState<Point | null>(null);
  const [endpoints, setEndpoints] = useState<Endpoints>({ left: {}, right: {} });
  const given = (unit: ChoiceUnit) => {
    const answer = answers[unit.ref];
    return answer && 'option' in answer ? answer.option : undefined;
  };
  const holder = (option: Ref) => units.find((unit) => given(unit) === option);
  const optionText = (ref: Ref | undefined) => options.find((option) => option.ref === ref)?.text;
  const prompt = (unit: ChoiceUnit) => unit.prompt.learning ?? unit.prompt.native ?? '';
  const assigned = units.filter((unit) => given(unit) !== undefined).length;
  // Once checked, move each right-hand box next to its assigned left-hand partner.
  const displayedUnits = feedback
    ? [...units].sort((a, b) => {
        const index = (unit: ChoiceUnit) => {
          const at = options.findIndex((option) => option.ref === given(unit));
          return at < 0 ? options.length : at;
        };
        return index(a) - index(b);
      })
    : units;

  useEffect(() => {
    const root = frame.current;
    if (!root) return;
    const measure = () => {
      const bounds = root.getBoundingClientRect();
      const read = (buttons: Map<Ref, HTMLButtonElement>, side: 'left' | 'right') =>
        Object.fromEntries(
          [...buttons].map(([ref, button]) => {
            // Measure the button, not the row: corrections can make a row taller.
            const rect = button.getBoundingClientRect();
            return [
              ref,
              {
                x: (side === 'left' ? rect.right : rect.left) - bounds.left,
                y: rect.top + rect.height / 2 - bounds.top,
              },
            ];
          }),
        );
      setEndpoints({ left: read(left.current, 'left'), right: read(right.current, 'right') });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    for (const button of [...left.current.values(), ...right.current.values()])
      observer.observe(button);
    const initial = requestAnimationFrame(measure);
    // After Check the right column slides in: a rect read during the slide
    // is off by its transform, so measure again once it has landed.
    root.addEventListener('animationend', measure);
    return () => {
      cancelAnimationFrame(initial);
      observer.disconnect();
      root.removeEventListener('animationend', measure);
    };
  }, [units, feedback]);

  function choose(side: 'left' | 'right', ref: Ref) {
    if (locked) return;
    if (selected && selected.side !== side) {
      const option = side === 'left' ? ref : selected.ref;
      const unit = side === 'right' ? ref : selected.ref;
      const previous = holder(option);
      if (previous && previous.ref !== unit) onAnswer(previous.ref, undefined);
      onAnswer(unit, { option });
      setSelected(null);
      setPointer(null);
    } else {
      setSelected(selected?.ref === ref ? null : { side, ref });
    }
  }

  const selectedText =
    selected?.side === 'left'
      ? optionText(selected.ref)
      : (units.find((unit) => unit.ref === selected?.ref)?.prompt.learning ??
        units.find((unit) => unit.ref === selected?.ref)?.prompt.native);
  const start = selected ? endpoints[selected.side][selected.ref] : undefined;

  return (
    <div className="lesson-matching flex flex-col gap-5">
      <p className="text-slate-400">{t('boardHint')}</p>
      <div
        ref={frame}
        className="lesson-matching-frame"
        onPointerMove={(event) => {
          if (!selected || locked || event.pointerType === 'touch') return;
          const bounds = event.currentTarget.getBoundingClientRect();
          setPointer({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
        }}
        onPointerLeave={() => setPointer(null)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setSelected(null);
            setPointer(null);
          }
        }}
      >
        <div
          className="lesson-matching-columns"
          style={{ '--matching-rows': Math.max(options.length, units.length, 1) } as CSSProperties}
        >
          <div role="group" aria-label={t('boardOptions')} className="lesson-matching-column">
            {options.map((option, index) => {
              const paired = holder(option.ref);
              const note = paired ? feedback?.get(paired.ref) : undefined;
              return (
                <button
                  key={option.ref}
                  ref={(button) => {
                    if (button) left.current.set(option.ref, button);
                    else left.current.delete(option.ref);
                  }}
                  type="button"
                  data-option={option.ref}
                  disabled={locked}
                  data-outcome={note?.outcome}
                  lang={option.lang === 'learning' ? lang : undefined}
                  aria-pressed={selected?.side === 'left' && selected.ref === option.ref}
                  aria-label={
                    paired
                      ? t('pairedWith', { text: option.text, partner: prompt(paired) })
                      : option.text
                  }
                  className={`lesson-match-button ${paired ? 'is-paired' : ''} ${note ? outcomeTone(note.outcome) : ''}`}
                  onClick={() => choose('left', option.ref)}
                >
                  <span>{option.text}</span>
                  {paired ? (
                    <span className="lesson-pair-badge" aria-hidden="true">
                      {index + 1}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <ul aria-label={t('boardSlots')} className="lesson-matching-column">
            {displayedUnits.map((unit) => {
              const option = given(unit);
              const note = feedback?.get(unit.ref);
              return (
                <li key={unit.ref} data-unit={unit.ref}>
                  <button
                    ref={(button) => {
                      if (button) right.current.set(unit.ref, button);
                      else right.current.delete(unit.ref);
                    }}
                    type="button"
                    disabled={locked}
                    data-outcome={note?.outcome}
                    lang={lang}
                    aria-pressed={selected?.side === 'right' && selected.ref === unit.ref}
                    aria-label={
                      option
                        ? t('pairedWith', { text: prompt(unit), partner: optionText(option) ?? '' })
                        : prompt(unit)
                    }
                    className={`lesson-match-button ${option ? 'is-paired' : ''} ${note ? `${outcomeTone(note.outcome)} animate-lesson-slide` : ''}`}
                    onClick={() => choose('right', unit.ref)}
                  >
                    <span>{prompt(unit)}</span>
                    {option ? (
                      <span className="lesson-pair-badge" aria-hidden="true">
                        {options.findIndex((entry) => entry.ref === option) + 1}
                      </span>
                    ) : null}
                  </button>
                  {note && note.outcome !== 'fully_correct' ? (
                    <p
                      className="mt-2 text-sm font-semibold text-green-400"
                      lang={lang}
                      data-correct-partner
                    >
                      <span aria-hidden="true">→ </span>
                      {note.answer}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
        <svg className="lesson-match-curves" aria-hidden="true">
          {units.map((unit) => {
            const option = given(unit);
            const from = option ? endpoints.left[option] : undefined;
            const to = endpoints.right[unit.ref];
            const note = feedback?.get(unit.ref);
            return from && to ? (
              <path
                key={unit.ref}
                data-pair={unit.ref}
                d={curve(from, to)}
                className={
                  note
                    ? note.outcome === 'fully_correct'
                      ? 'is-correct'
                      : 'is-incorrect'
                    : undefined
                }
              />
            ) : null;
          })}
          {!locked && start && pointer ? (
            <path
              className="is-preview"
              d={selected?.side === 'left' ? curve(start, pointer) : curve(pointer, start)}
            />
          ) : null}
        </svg>
      </div>
      <p className="text-slate-400" role="status">
        {selectedText ? <>{t('pairSelected', { text: selectedText })} </> : null}
        {t('pairingStatus', { count: assigned, total: units.length })}
      </p>
    </div>
  );
}
