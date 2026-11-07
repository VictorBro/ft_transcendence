'use client';

import { useId, useRef, type KeyboardEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { Language } from '@ft/shared';

import { pick } from '@/lib/localized';
import type { Answer, Ref, UnitFeedback, UnitView } from './types';

/*
 * B1, the unit controls: one per unit kind of the page view (text,
 * choice, order, spot), and the gap that puts a text or a choice inside
 * its sentence. They hold no state: the draft comes in as `value`, and
 * every change goes out through `onChange`. Once the feedback is there,
 * they lock and show it; the right answer only ever comes from it.
 */

type Unit<K extends UnitView['kind']> = Extract<UnitView, { kind: K }>;

interface ControlProps<K extends UnitView['kind']> {
  unit: Unit<K>;
  value: Answer | undefined;
  onChange: (answer: Answer | undefined) => void;
  feedback: UnitFeedback | undefined;
  locked: boolean;
  lang: Language;
}

export type Outcome = UnitFeedback['outcome'];

/** The colour of an outcome: green, amber for the half point, red. */
export function outcomeTone(outcome: Outcome | undefined): string {
  switch (outcome) {
    case 'fully_correct':
      return 'border-green-500 bg-green-500/10';
    case 'orthography_only':
      return 'border-amber-400 bg-amber-400/10';
    case 'incorrect':
    case 'unanswered':
      return 'border-red-500 bg-red-500/10';
    default:
      return 'border-slate-700 bg-slate-900';
  }
}

/**
 * The arrow keys of a radio group: they move to the next or previous
 * option and pick it, as native radios do. With roving tabindex (see
 * rovingTab), Tab enters the group once and leaves it.
 */
export function radioArrows(event: KeyboardEvent<HTMLElement>) {
  const step =
    event.key === 'ArrowRight' || event.key === 'ArrowDown'
      ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
        ? -1
        : 0;
  if (step === 0) return;
  const radios = [
    ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)'),
  ];
  const at = radios.findIndex((r) => r === document.activeElement);
  if (at < 0 || radios.length < 2) return;
  event.preventDefault();
  const next = radios[(at + step + radios.length) % radios.length]!;
  next.focus();
  if (next.getAttribute('aria-checked') !== 'true') next.click();
}

/** The tab stop of a radio group: the picked option, else the first. */
export const rovingTab = (chosen: boolean, index: number, anyChosen: boolean) =>
  chosen || (!anyChosen && index === 0) ? 0 : -1;

const textOf = (value: Answer | undefined) => (value && 'text' in value ? value.text : '');

/** A text box, inside its gap when the prompt has text around it. */
export function TextControl({
  unit,
  value,
  onChange,
  feedback,
  locked,
  lang,
}: ControlProps<'text'>) {
  const t = useTranslations('Lesson');
  const { before, after, learning, native } = unit.prompt;
  const gap = before !== undefined || after !== undefined;
  const correction =
    feedback && feedback.outcome !== 'fully_correct' ? (
      <strong lang={lang} className="font-semibold text-green-400" data-inline-answer>
        <span className="sr-only">{t('correct')}: </span>
        {feedback.form ?? feedback.answer}
      </strong>
    ) : null;
  const input = (
    <input
      type="text"
      lang={lang}
      value={textOf(value)}
      disabled={locked}
      aria-label={
        gap ? `${before ?? ''} … ${after ?? ''}`.trim() : (learning ?? native ?? t('yourAnswer'))
      }
      autoComplete="off"
      autoCapitalize="off"
      spellCheck={false}
      onChange={(e) => onChange(e.target.value === '' ? undefined : { text: e.target.value })}
      className={`min-h-11 min-w-0 rounded-md border px-3 py-2 text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-slate-100 disabled:opacity-90 ${outcomeTone(
        feedback?.outcome,
      )} ${gap ? 'w-40 max-w-full' : 'w-full'}`}
    />
  );
  if (gap) {
    return (
      <p
        lang={lang}
        className="flex flex-wrap items-center gap-x-2 gap-y-2 text-lg leading-relaxed"
      >
        {before ? <span>{before}</span> : null}
        {input}
        {correction}
        {after ? <span>{after}</span> : null}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <PromptLine unit={unit} lang={lang} />
      {input}
      {correction}
    </div>
  );
}

/** The prompt of a unit with no gap: the course-language line, then the mother-tongue one. */
export function PromptLine({ unit, lang }: { unit: UnitView; lang: Language }) {
  const { learning, native } = unit.prompt;
  if (learning === undefined && native === undefined) return null;
  return (
    <p className="flex flex-col">
      {learning !== undefined ? (
        <span lang={lang} className="text-lg font-medium text-slate-100">
          {learning}
        </span>
      ) : null}
      {native !== undefined ? <span className="text-slate-400">{native}</span> : null}
    </p>
  );
}

/** A sentence with a blank where a choice goes: the blank shows the pick. */
export function GapSentence({
  unit,
  value,
  lang,
}: {
  unit: UnitView;
  value: Answer | undefined;
  lang: Language;
}) {
  const { before, after } = unit.prompt;
  const picked =
    unit.kind === 'choice' && value && 'option' in value
      ? unit.options.find((o) => o.ref === value.option)?.text
      : undefined;
  return (
    <p lang={lang} className="text-lg leading-relaxed">
      {before ? <>{before} </> : null}
      <span
        className={`inline-block min-w-16 border-b-2 px-1 text-center ${
          picked ? 'border-indigo-400 text-indigo-200' : 'border-slate-500 text-slate-500'
        }`}
      >
        {picked ?? ' '}
      </span>
      {after ? <> {after}</> : null}
    </p>
  );
}

/** One option to pick among several, in a radio group. */
export function ChoiceControl({
  unit,
  value,
  onChange,
  feedback,
  locked,
  lang,
}: ControlProps<'choice'>) {
  const t = useTranslations('Lesson');
  const picked = value && 'option' in value ? value.option : undefined;
  const right = new Set(feedback?.correct ?? []);
  const gap = unit.prompt.before !== undefined || unit.prompt.after !== undefined;

  return (
    <div className="flex flex-col gap-3">
      {gap ? (
        <GapSentence unit={unit} value={value} lang={lang} />
      ) : (
        <PromptLine unit={unit} lang={lang} />
      )}
      <div
        role="radiogroup"
        aria-label={t('pick')}
        onKeyDown={radioArrows}
        className="lesson-choice-options flex flex-col gap-3"
      >
        {unit.options.map((option, index) => {
          const chosen = picked === option.ref;
          // Once checked: the right options in green, a wrong pick in red.
          const tone = feedback
            ? right.has(option.ref)
              ? 'border-green-500 bg-green-500/15 text-green-200'
              : chosen
                ? 'border-red-500 bg-red-500/15 text-red-200'
                : 'border-slate-800 bg-slate-900 text-slate-400'
            : chosen
              ? 'border-indigo-400 bg-indigo-500/20 text-slate-100'
              : 'border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800';
          return (
            <button
              key={option.ref}
              type="button"
              role="radio"
              aria-checked={chosen}
              tabIndex={rovingTab(chosen, index, picked !== undefined)}
              disabled={locked}
              lang={option.lang === 'learning' ? lang : undefined}
              // As a native radio: picking selects, and never clears.
              onClick={() => {
                if (!chosen) onChange({ option: option.ref });
              }}
              className={`min-h-11 rounded-md border px-4 py-2 text-left transition-colors disabled:cursor-default ${tone}`}
            >
              {option.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Words to put in order: a tap moves a word from the bank to the
 * sentence, and back. The bank has the distractors in it, unmarked.
 */
export function OrderControl({
  unit,
  value,
  onChange,
  feedback,
  locked,
  lang,
}: ControlProps<'order'>) {
  const t = useTranslations('Lesson');
  const placed = value && 'tokens' in value ? value.tokens : [];
  const text = (ref: Ref) => unit.tokens.find((x) => x.ref === ref)?.text ?? '';
  const bank = unit.tokens.filter((x) => !placed.includes(x.ref));
  const set = (tokens: Ref[]) => onChange(tokens.length ? { tokens } : undefined);
  const lineId = useId();

  return (
    <div className="flex flex-col gap-3">
      <PromptLine unit={unit} lang={lang} />
      <div className="flex flex-col gap-1">
        <span
          id={lineId}
          className="text-xs font-semibold tracking-widest text-slate-500 uppercase"
        >
          {t('yourSentence')}
        </span>
        <ol
          aria-labelledby={lineId}
          lang={lang}
          className={`flex min-h-14 flex-wrap items-center gap-2 rounded-md border border-dashed p-2 ${outcomeTone(
            feedback?.outcome,
          )}`}
        >
          {placed.map((ref, n) => (
            <li key={ref}>
              <button
                type="button"
                disabled={locked}
                aria-label={t('remove', { text: text(ref) })}
                onClick={() => set(placed.filter((_, m) => m !== n))}
                className="min-h-10 rounded-md border border-indigo-400 bg-indigo-500/20 px-3 py-1 text-slate-100 disabled:cursor-default"
              >
                {text(ref)}
              </button>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold tracking-widest text-slate-500 uppercase">
          {t('wordBank')}
        </span>
        <div lang={lang} className="flex flex-wrap gap-2" role="group" aria-label={t('wordBank')}>
          {bank.map((token) => (
            <button
              key={token.ref}
              type="button"
              disabled={locked}
              onClick={() => set([...placed, token.ref])}
              className="min-h-10 rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-slate-100 transition-colors hover:bg-slate-800 disabled:cursor-default disabled:opacity-60"
            >
              {token.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A sentence with one wrong word: pick it, then correct it, typed or from a list. */
export function SpotControl({
  unit,
  value,
  onChange,
  feedback,
  locked,
  lang,
}: ControlProps<'spot'>) {
  const t = useTranslations('Lesson');
  const current = value && 'token' in value ? value : undefined;
  const correctionId = useId();
  // What was typed for each word: the arrow keys pick every word on the
  // way, and coming back to a corrected word brings its correction back.
  const typed = useRef<Record<string, string>>({});

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-400">{t('spotHint')}</p>
      <div
        lang={lang}
        role="radiogroup"
        aria-label={t('spotHint')}
        onKeyDown={radioArrows}
        className="flex flex-wrap gap-2 text-lg"
      >
        {unit.tokens.map((token, index) => {
          const chosen = current?.token === token.ref;
          const faulty = feedback?.faulty === token.ref;
          const tone = feedback
            ? faulty
              ? 'border-green-500 bg-green-500/15 text-green-200'
              : chosen
                ? 'border-red-500 bg-red-500/15 text-red-200'
                : 'border-transparent text-slate-300'
            : chosen
              ? 'border-indigo-400 bg-indigo-500/20 text-slate-100'
              : 'border-transparent text-slate-100 hover:border-slate-700';
          return (
            <button
              key={token.ref}
              type="button"
              role="radio"
              aria-checked={chosen}
              tabIndex={rovingTab(chosen, index, current !== undefined)}
              disabled={locked}
              // Another word gets its own correction; the picked one stays picked.
              onClick={() => {
                if (chosen) return;
                if (current) typed.current[current.token] = current.text;
                onChange({ token: token.ref, text: typed.current[token.ref] ?? '' });
              }}
              className={`min-h-10 rounded-md border px-2 py-1 transition-colors disabled:cursor-default ${tone}`}
            >
              {token.text}
            </button>
          );
        })}
      </div>
      {current ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={correctionId} className="text-sm font-medium">
            {t('correction')}
          </label>
          {unit.correction.mode === 'select' ? (
            <select
              id={correctionId}
              lang={lang}
              disabled={locked}
              value={current.text}
              onChange={(e) => onChange({ token: current.token, text: e.target.value })}
              className={`min-h-11 rounded-md border px-3 py-2 text-slate-100 ${outcomeTone(feedback?.outcome)}`}
            >
              <option value="">{t('pick')}</option>
              {unit.correction.choices.map((choice) => (
                <option key={choice} value={choice}>
                  {choice}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={correctionId}
              type="text"
              lang={lang}
              disabled={locked}
              value={current.text}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(e) => onChange({ token: current.token, text: e.target.value })}
              className={`min-h-11 w-56 max-w-full rounded-md border px-3 py-2 text-slate-100 ${outcomeTone(
                feedback?.outcome,
              )}`}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The correction of one checked unit: its outcome, the half point, the
 * right answer when it was not given, and why, in the interface language.
 */
export function FeedbackNote({ feedback, lang }: { feedback: UnitFeedback; lang: Language }) {
  const t = useTranslations('Lesson');
  const locale = useLocale();
  const { outcome } = feedback;
  const label =
    outcome === 'fully_correct'
      ? t('correct')
      : outcome === 'orthography_only'
        ? t('almost')
        : t('incorrect');
  const tone =
    outcome === 'fully_correct'
      ? 'text-green-300'
      : outcome === 'orthography_only'
        ? 'text-amber-300'
        : 'text-red-300';

  return (
    <div className="flex flex-col gap-1 text-sm" data-outcome={outcome}>
      <p className={`font-semibold ${tone}`}>
        {outcome === 'orthography_only' ? t('halfPoint') : label}
      </p>
      {outcome !== 'fully_correct' ? (
        <p>
          {t.rich('answerWas', {
            answer: feedback.form ?? feedback.answer,
            a: (chunks) => (
              <span lang={lang} className="font-medium text-slate-100">
                {chunks}
              </span>
            ),
          })}
          {feedback.translation ? (
            <span className="text-slate-400"> ({feedback.translation})</span>
          ) : null}
        </p>
      ) : null}
      {feedback.accepted ? (
        <p className="text-slate-400">
          {t.rich('acceptedToo', {
            answer: feedback.accepted,
            a: (chunks) => <span lang={lang}>{chunks}</span>,
          })}
        </p>
      ) : null}
      <p className="text-slate-300">{pick(feedback.explanation, locale)}</p>
    </div>
  );
}

/** The control of a unit, by its kind. */
export function UnitControl(props: ControlProps<UnitView['kind']>) {
  const { unit } = props;
  switch (unit.kind) {
    case 'text':
      return <TextControl {...(props as ControlProps<'text'>)} />;
    case 'choice':
      return <ChoiceControl {...(props as ControlProps<'choice'>)} />;
    case 'order':
      return <OrderControl {...(props as ControlProps<'order'>)} />;
    case 'spot':
      return <SpotControl {...(props as ControlProps<'spot'>)} />;
  }
}
