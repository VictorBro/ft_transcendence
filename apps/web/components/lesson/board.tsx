'use client';

import { useState, type DragEvent } from 'react';
import { useTranslations } from 'next-intl';

import { FeedbackNote, outcomeTone } from './controls';
import type { AnswerProps, Ref, UnitView } from './types';

type ChoiceUnit = Extract<UnitView, { kind: 'choice' }>;

/**
 * B2, the matching board: choice units that share one set of options,
 * each option used once. Two layouts:
 * - `pairs`: the options on the left in their order, the units' boxes on
 *   the right; select one side, then the other. Once checked, the boxes
 *   slide next to the option they were given.
 * - `drag`: a bank of options above the rows; drag one onto a row, or
 *   select it and then the row.
 * Either way, every move is a button or a drop, so the keyboard does
 * everything the mouse does.
 */
export function MatchingBoard({
  units,
  layout,
  lang,
  answers,
  onAnswer,
  feedback,
  locked,
}: AnswerProps & { units: ChoiceUnit[]; layout: 'pairs' | 'drag' }) {
  const t = useTranslations('Lesson');
  // The options are the same on every unit: the first one's list is the board's.
  const options = units[0]?.options ?? [];
  const [armedOption, setArmedOption] = useState<Ref | null>(null);
  const [armedUnit, setArmedUnit] = useState<Ref | null>(null);

  const given = (unit: ChoiceUnit) => {
    const answer = answers[unit.ref];
    return answer && 'option' in answer ? answer.option : undefined;
  };
  const holder = (option: Ref) => units.find((u) => given(u) === option);
  const textOf = (option: Ref | undefined) => options.find((o) => o.ref === option)?.text;
  const optionLang = (option: Ref | undefined) =>
    options.find((o) => o.ref === option)?.lang === 'learning' ? lang : undefined;

  function pair(unit: Ref, option: Ref) {
    // One box per option: taking it from another box empties that one.
    const previous = units.find((u) => given(u) === option && u.ref !== unit);
    if (previous) onAnswer(previous.ref, undefined);
    onAnswer(unit, { option });
    setArmedOption(null);
    setArmedUnit(null);
  }

  function clickOption(option: Ref) {
    if (armedUnit) pair(armedUnit, option);
    else setArmedOption(armedOption === option ? null : option);
  }

  function clickUnit(unit: ChoiceUnit) {
    if (armedOption) return pair(unit.ref, armedOption);
    // A box that holds an option gives it back.
    if (given(unit) && !armedUnit) return onAnswer(unit.ref, undefined);
    setArmedUnit(armedUnit === unit.ref ? null : unit.ref);
  }

  function drop(event: DragEvent, unit: Ref) {
    event.preventDefault();
    if (locked) return;
    const option = event.dataTransfer.getData('text/plain');
    if (options.some((o) => o.ref === option)) pair(unit, option);
  }

  const optionButton = (option: (typeof options)[number]) => {
    const used = holder(option.ref);
    const armed = armedOption === option.ref;
    const className = `min-h-11 rounded-md border px-3 py-2 text-left transition-colors ${
      locked ? 'cursor-default' : 'cursor-pointer'
    } ${
      armed
        ? 'border-indigo-400 bg-indigo-500/25 text-slate-100'
        : used
          ? 'border-slate-800 bg-slate-900 text-slate-500'
          : 'border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800'
    }`;
    const shared = {
      'aria-pressed': armed,
      lang: option.lang === 'learning' ? lang : undefined,
      'data-option': true,
      className,
    };

    if (layout === 'drag') {
      // Firefox never starts a drag from a <button>: a draggable element
      // with the button role, which the keyboard works as one.
      return (
        <div
          key={option.ref}
          role="button"
          tabIndex={locked ? -1 : 0}
          aria-disabled={locked}
          draggable={!locked}
          onDragStart={(e) => e.dataTransfer.setData('text/plain', option.ref)}
          onClick={() => {
            if (!locked) clickOption(option.ref);
          }}
          onKeyDown={(e) => {
            if (locked || (e.key !== 'Enter' && e.key !== ' ')) return;
            e.preventDefault();
            clickOption(option.ref);
          }}
          {...shared}
        >
          {option.text}
        </div>
      );
    }

    return (
      <button
        key={option.ref}
        type="button"
        disabled={locked}
        onClick={() => clickOption(option.ref)}
        {...shared}
      >
        {option.text}
      </button>
    );
  };

  const unitRow = (unit: ChoiceUnit) => {
    const option = given(unit);
    const note = feedback?.get(unit.ref);
    const armed = armedUnit === unit.ref;
    return (
      <li key={unit.ref} data-unit={unit.ref} className="flex flex-col gap-2">
        <button
          type="button"
          disabled={locked}
          aria-pressed={armed}
          onClick={() => clickUnit(unit)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => drop(e, unit.ref)}
          className={`flex min-h-12 w-full flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-left transition-colors disabled:cursor-default ${
            armed ? 'border-indigo-400 bg-indigo-500/20' : outcomeTone(note?.outcome)
          }`}
        >
          <span lang={lang} className="font-medium text-slate-100">
            {unit.prompt.learning ?? unit.prompt.native}
          </span>
          <span
            lang={optionLang(option)}
            // The pair slides in once the feedback arrives.
            className={`rounded px-2 py-0.5 text-sm ${
              option ? 'bg-indigo-500/20 text-indigo-100' : 'text-slate-500'
            } ${note ? 'animate-lesson-slide' : ''}`}
          >
            {textOf(option) ?? '…'}
          </span>
        </button>
        {note && note.outcome !== 'fully_correct' ? (
          <FeedbackNote feedback={note} lang={lang} />
        ) : null}
      </li>
    );
  };

  if (layout === 'drag') {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-400">{t('dragHint')}</p>
        <div role="group" aria-label={t('forms')} className="flex flex-wrap gap-2">
          {options.map(optionButton)}
        </div>
        <ul className="flex flex-col gap-2">{units.map(unitRow)}</ul>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-400">{t('boardHint')}</p>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div role="group" className="flex flex-col gap-2">
          {options.map(optionButton)}
        </div>
        <ul className="flex flex-col gap-2">{units.map(unitRow)}</ul>
      </div>
    </div>
  );
}
