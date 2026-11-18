'use client';

import { useLocale, useTranslations } from 'next-intl';

import { pick } from '@/lib/localized';
import { radioArrows, rovingTab } from './controls';
import { Listen } from './listen';
import type { AnswerProps, UnitView } from './types';

type ChoiceUnit = Extract<UnitView, { kind: 'choice' }>;

/*
 * B4, the gender page (#147): one row per noun, the bare term and a pill
 * per gender. The term is all the row shows before Check; the teaching
 * form and the translation come with the feedback, so the article never
 * gives the gender away. Functions (#149) uses it for its words too.
 */

/** A gender option's label in the interface language; the option text is the gender. */
export function useGenderLabel(): (gender: string) => string {
  const t = useTranslations('Lesson');
  return (gender) =>
    gender === 'masculine' || gender === 'feminine' || gender === 'neuter'
      ? t(`genders.${gender}`)
      : gender;
}

export function GenderPage({
  units,
  lang,
  answers,
  onAnswer,
  feedback,
  locked,
}: AnswerProps & { units: ChoiceUnit[] }) {
  const t = useTranslations('Lesson');
  const locale = useLocale();
  const label = useGenderLabel();
  const right = units.filter((u) => feedback?.get(u.ref)?.outcome === 'fully_correct').length;

  return (
    <div className="flex flex-col gap-4">
      {feedback ? (
        <p role="status" className="font-semibold text-slate-100">
          {t('gendersCorrect', { right, total: units.length })}
        </p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {units.map((unit) => {
          const note = feedback?.get(unit.ref);
          const picked = (() => {
            const answer = answers[unit.ref];
            return answer && 'option' in answer ? answer.option : undefined;
          })();
          const correct = new Set(note?.correct ?? []);
          const term = unit.prompt.learning ?? '';
          // After Check the row teaches: the form with its article, and its translation.
          const shown = note?.form ?? term;
          return (
            <li
              key={unit.ref}
              data-unit={unit.ref}
              data-outcome={note?.outcome}
              className={`flex flex-col gap-3 rounded-xl border bg-slate-950 p-4 ${
                note
                  ? note.outcome === 'fully_correct'
                    ? 'border-green-600/70'
                    : 'border-red-500/70'
                  : 'border-slate-800'
              }`}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Listen text={shown} lang={lang} small />
                <span lang={lang} className="text-lg font-semibold text-slate-100">
                  {shown}
                </span>
                {note?.translation ? (
                  <span className="text-sm text-slate-400">{note.translation}</span>
                ) : null}
              </div>
              <div
                role="radiogroup"
                aria-label={t('genderOf', { term })}
                onKeyDown={radioArrows}
                className="flex flex-wrap gap-2"
              >
                {unit.options.map((option, index) => {
                  const chosen = picked === option.ref;
                  const tone = note
                    ? correct.has(option.ref)
                      ? 'border-green-500 text-green-300'
                      : chosen
                        ? 'border-red-500 bg-red-500/10 text-red-300'
                        : 'border-slate-700 text-slate-300'
                    : chosen
                      ? 'border-indigo-400 bg-indigo-500/25 text-slate-100'
                      : 'border-slate-700 text-slate-100 hover:bg-slate-800';
                  return (
                    <button
                      key={option.ref}
                      type="button"
                      role="radio"
                      aria-checked={chosen}
                      tabIndex={rovingTab(chosen, index, picked !== undefined)}
                      disabled={locked}
                      onClick={() => {
                        if (!chosen) onAnswer(unit.ref, { option: option.ref });
                      }}
                      // The task's 52px radios are for full-width options: these are pills.
                      className={`min-h-11! rounded-full! border px-4! py-2! transition-colors disabled:cursor-default ${tone} ${
                        chosen && note ? 'font-semibold' : ''
                      }`}
                    >
                      {label(option.text)}
                    </button>
                  );
                })}
              </div>
              {note && note.outcome !== 'fully_correct' ? (
                <p className="text-sm text-slate-300">{pick(note.explanation, locale)}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
