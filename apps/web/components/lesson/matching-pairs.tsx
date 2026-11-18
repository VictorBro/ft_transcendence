'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useTranslations } from 'next-intl';

import { outcomeTone } from './controls';
import { ListenButton } from './speech';
import type { AnswerProps, Ref, UnitView } from './types';

type ChoiceUnit = Extract<UnitView, { kind: 'choice' }>;
type Point = { x: number; y: number };
type Endpoints = { left: Record<Ref, Point>; right: Record<Ref, Point> };

/** How long the right-hand boxes take to slide level with their partners after Check. */
export const MATCH_SLIDE_MS = 1200;

/**
 * The row of each right-hand box after Check, as in the prototype: a right
 * pair keeps the row of its pick; a wrong or open box takes the first free
 * row among its right partners (a form shared by several persons may sit at
 * any of them), else the first free row.
 */
export function checkedRows(
  units: { ref: Ref; pick?: Ref; correct: Ref[]; right: boolean }[],
  rows: Ref[],
): Map<Ref, number> {
  const rowOf = new Map<Ref, number>();
  const taken = new Set<number>();
  const take = (unit: Ref, row: number) => {
    rowOf.set(unit, row);
    taken.add(row);
  };
  for (const u of units) {
    const row = u.right && u.pick ? rows.indexOf(u.pick) : -1;
    if (row >= 0 && !taken.has(row)) take(u.ref, row);
  }
  for (const fits of [
    (u: (typeof units)[number], r: number) => u.correct.includes(rows[r]!),
    () => true,
  ]) {
    for (const u of units) {
      if (rowOf.has(u.ref)) continue;
      const free = rows.findIndex((_, r) => !taken.has(r) && fits(u, r));
      if (free >= 0) take(u.ref, free);
    }
  }
  // More boxes than rows: the rest follow below.
  let next = rows.length;
  for (const u of units) if (!rowOf.has(u.ref)) rowOf.set(u.ref, next++);
  return rowOf;
}

const curve = (from: Point, to: Point) => {
  const bend = Math.max(24, Math.abs(to.x - from.x) / 2);
  return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`;
};

/**
 * Two editable columns: curves on desktop, matching numbered badges on phones.
 * After Check every right-hand box slides level with its right partner, as in
 * the prototype; right boxes turn green, wrong ones red, and only a wrong pair
 * keeps its (red) curve or badge. The right partner is read to screen readers.
 */
export function MatchingPairs({
  units,
  lang,
  answers,
  onAnswer,
  feedback,
  locked,
  speak = false,
  persons = false,
  hold,
}: AnswerProps & { units: ChoiceUnit[]; speak?: boolean; persons?: boolean }) {
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
  const isRight = (unit: ChoiceUnit) => feedback?.get(unit.ref)?.outcome === 'fully_correct';
  const allRight = Boolean(feedback) && units.every(isRight);
  // Once checked, each right-hand box moves level with its right partner.
  const rowOf = feedback
    ? checkedRows(
        units.map((unit) => ({
          ref: unit.ref,
          pick: given(unit),
          correct: feedback.get(unit.ref)?.correct ?? [],
          right: isRight(unit),
        })),
        options.map((option) => option.ref),
      )
    : null;
  const displayedUnits = rowOf
    ? [...units].sort((a, b) => rowOf.get(a.ref)! - rowOf.get(b.ref)!)
    : units;
  // After Check a pair keeps its curve and badge only when it is wrong (all of them on an all-right page).
  const shownPair = (unit: ChoiceUnit | undefined) =>
    Boolean(unit && given(unit) !== undefined && (!feedback || allRight || !isRight(unit)));

  const measure = useCallback(() => {
    const root = frame.current;
    if (!root) return;
    const bounds = root.getBoundingClientRect();
    const read = (buttons: Map<Ref, HTMLButtonElement>, side: 'left' | 'right') =>
      Object.fromEntries(
        [...buttons].map(([ref, button]) => {
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
  }, []);

  // Where the right-hand boxes sat before Check: the slide starts there.
  const tops = useRef(new Map<Ref, number>());
  const wasChecked = useRef(Boolean(feedback));
  const sliding = useRef(false);
  useLayoutEffect(() => {
    if (feedback || sliding.current || !frame.current) return;
    tops.current = new Map(
      [...frame.current.querySelectorAll<HTMLElement>('[data-unit]')].map((row) => [
        row.dataset.unit!,
        row.getBoundingClientRect().top,
      ]),
    );
  });
  // On Check each box glides from its old row to its new one, frame by frame,
  // and the curves are redrawn every frame so they move with the boxes. It
  // also plays under reduced motion: it shows where each word belongs.
  useLayoutEffect(() => {
    const checked = Boolean(feedback);
    const started = checked && !wasChecked.current;
    wasChecked.current = checked;
    if (!started || !frame.current) return;
    const deltas = [...frame.current.querySelectorAll<HTMLElement>('[data-unit]')]
      .map((row) => {
        const top = row.getBoundingClientRect().top;
        return [row, (tops.current.get(row.dataset.unit!) ?? top) - top] as const;
      })
      .filter(([, delta]) => Math.abs(delta) > 0.5);
    if (deltas.length === 0) return;
    sliding.current = true;
    // Starts slowly, speeds up, settles.
    const animations = deltas.map(([row, delta]) =>
      row.animate([{ transform: `translateY(${delta}px)` }, { transform: 'none' }], {
        duration: MATCH_SLIDE_MS,
        easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
      }),
    );
    let id = requestAnimationFrame(function follow() {
      measure();
      if (sliding.current) id = requestAnimationFrame(follow);
    });
    void Promise.all(animations.map((a) => a.finished))
      .catch(() => undefined)
      .then(() => {
        sliding.current = false;
        measure();
      });
    return () => {
      cancelAnimationFrame(id);
      for (const animation of animations) animation.cancel();
      sliding.current = false;
    };
  }, [feedback, measure]);

  useEffect(() => {
    const root = frame.current;
    if (!root) return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    for (const button of [...left.current.values(), ...right.current.values()])
      observer.observe(button);
    const initial = requestAnimationFrame(measure);
    return () => {
      cancelAnimationFrame(initial);
      observer.disconnect();
    };
  }, [units, feedback, measure]);

  // Check waits until every box has its partner, as in the prototype.
  const full = assigned >= units.length;
  const holdKey = `pairs:${units[0]?.ref ?? ''}`;
  useEffect(() => {
    hold(holdKey, !locked && !feedback && !full ? { kind: 'block' } : null);
    return () => hold(holdKey, null);
  }, [hold, holdKey, locked, feedback, full]);

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
          className={`lesson-matching-columns ${persons ? 'is-persons' : ''}`}
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
                  {shownPair(paired) ? (
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
                <li
                  key={unit.ref}
                  data-unit={unit.ref}
                  className={speak ? 'has-listen' : undefined}
                  style={rowOf ? { gridRow: rowOf.get(unit.ref)! + 1 } : undefined}
                >
                  {speak && prompt(unit) ? (
                    <span className="lesson-match-listen">
                      <ListenButton text={prompt(unit)} lang={lang} size="sm" />
                    </span>
                  ) : null}
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
                    className={`lesson-match-button ${option ? 'is-paired' : ''} ${note ? outcomeTone(note.outcome) : ''}`}
                    onClick={() => choose('right', unit.ref)}
                  >
                    <span>{prompt(unit)}</span>
                    {shownPair(unit) ? (
                      <span className="lesson-pair-badge" aria-hidden="true">
                        {options.findIndex((entry) => entry.ref === option) + 1}
                      </span>
                    ) : null}
                  </button>
                  {note && note.outcome !== 'fully_correct' ? (
                    <p className="sr-only" lang={lang} data-correct-partner>
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
            return from && to && shownPair(unit) ? (
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
