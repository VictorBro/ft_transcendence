'use client';

import { useTranslations } from 'next-intl';

import { radioArrows, rovingTab } from './controls';
import { ListenButton } from './speech';
import type { AnswerProps, UnitView } from './types';

type ChoiceUnit = Extract<UnitView, { kind: 'choice' }>;

/** An option text the interface owns: a gender ("masculine") in the interface language. */
export function useOptionLabel() {
  const genders = useTranslations('Genders');
  return (option: ChoiceUnit['options'][number]) =>
    option.lang === 'ui' && genders.has(option.text) ? genders(option.text) : option.text;
}

/**
 * B4, the gender page (#147): one row per noun, the bare term and a pill
 * per gender. Before Check the row shows only the term; the teaching form
 * and the translation come with the feedback, beside the right gender in
 * green and a wrong pick in red.
 */
export function GenderPage({
  units,
  lang,
  answers,
  onAnswer,
  feedback,
  locked,
}: AnswerProps & { units: ChoiceUnit[] }) {
  const t = useTranslations('Lesson');
  const label = useOptionLabel();
  const right = feedback
    ? units.filter((u) => feedback.get(u.ref)?.outcome === 'fully_correct').length
    : 0;

  return (
    <section className="lesson-item flex flex-col gap-4">
      {feedback ? (
        <p className="font-semibold text-slate-100">
          {t('gendersCorrect', { count: right, total: units.length })}
        </p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {units.map((unit) => {
          const note = feedback?.get(unit.ref);
          const value = answers[unit.ref];
          const picked = value && 'option' in value ? value.option : undefined;
          const correct = new Set(note?.correct ?? []);
          const word = note?.form ?? unit.prompt.learning ?? '';
          return (
            <li
              key={unit.ref}
              data-unit={unit.ref}
              data-outcome={note?.outcome}
              className={`lesson-gender-row ${note ? (note.outcome === 'fully_correct' ? 'is-right' : 'is-wrong') : ''}`}
            >
              <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="self-center">
                  <ListenButton text={word} lang={lang} size="sm" />
                </span>
                <span lang={lang} className="text-lg font-bold text-slate-100">
                  {word}
                </span>
                {note?.translation ? (
                  <span className="text-sm text-slate-400">{note.translation}</span>
                ) : null}
              </p>
              <div
                role="radiogroup"
                aria-label={unit.prompt.learning}
                onKeyDown={radioArrows}
                className="flex flex-wrap gap-2"
              >
                {unit.options.map((option, index) => {
                  const chosen = picked === option.ref;
                  const tone = note
                    ? correct.has(option.ref)
                      ? 'is-correct'
                      : chosen
                        ? 'is-incorrect'
                        : ''
                    : chosen
                      ? 'is-chosen'
                      : '';
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
                      className={`lesson-pill ${tone}`}
                    >
                      {label(option)}
                    </button>
                  );
                })}
              </div>
              {note && note.outcome !== 'fully_correct' ? (
                <span className="sr-only" role="status">
                  {t('incorrect')}.{' '}
                  {t.rich('answerWas', {
                    answer: label({ ref: '', text: note.answer, lang: 'ui' }),
                    a: (chunks) => chunks,
                  })}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
