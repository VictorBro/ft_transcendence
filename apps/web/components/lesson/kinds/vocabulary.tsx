'use client';

import { useLocale, useTranslations } from 'next-intl';
import { lessons, type Language } from '@ft/shared';

import { pick } from '@/lib/localized';
import { MatchingBoard } from '../board';
import { radioArrows, rovingTab } from '../controls';
import { Flashcards } from '../flashcards';
import { useGate } from '../gate';
import { GenderPage, useGenderLabel } from '../gender-page';
import { Listen } from '../listen';
import { RichText } from '../rich-text';
import type { AnswerProps, Gender, ItemProps, ItemRenderers, UnitView } from '../types';
import { ItemCard, Units } from '../units';

/**
 * The vocabulary kind's renderers (#147): the introduction, the B3
 * flashcards, the B2 matching, the B4 gender page, the typed gaps with
 * their four reference words, and the translation exam. No listening
 * exercise: the player leaves them out of vocabulary lessons. The Listen
 * buttons only help, and are not there without a voice.
 */

function Introduction({ item, lang }: ItemProps<'vocabulary_introduction'>) {
  const locale = useLocale();
  // The text lists the new words itself; no Listen button here (#147).
  return (
    <ItemCard>
      <RichText source={pick(item.text, locale)} lang={lang} />
    </ItemCard>
  );
}

function Cards({ item, lang, onGate }: ItemProps<'vocabulary_flashcards'>) {
  const cards = item.cards.map((card) => ({
    ref: card.ref,
    // The front asks in the mother tongue; the back answers in the course language.
    label: card.translations.join(', '),
    front: <span>{card.translations.join(', ')}</span>,
    back: (
      <>
        <div className="flex flex-wrap items-center gap-3">
          <span lang={lang} className="text-2xl font-semibold text-indigo-200">
            {card.text}
          </span>
          <Listen text={card.text} lang={lang} />
        </div>
        <p className="flex items-start gap-2 text-slate-300">
          <Listen text={card.example.text} lang={lang} small />
          <span>
            <span lang={lang} className="text-slate-100">
              {card.example.text}
            </span>{' '}
            <span className="text-slate-400">– {card.example.translation}</span>
          </span>
        </p>
      </>
    ),
  }));
  return (
    <ItemCard>
      <Flashcards cards={cards} onGate={onGate} />
    </ItemCard>
  );
}

function Matching({ item, ...props }: ItemProps<'vocabulary_matching'>) {
  return (
    <ItemCard>
      <MatchingBoard units={item.units} layout="pairs" listen {...props} />
    </ItemCard>
  );
}

function Genders({ item, ...props }: ItemProps<'vocabulary_gender_select'>) {
  return (
    <ItemCard>
      <GenderPage units={item.units} {...props} />
    </ItemCard>
  );
}

function TypedGap({ item, ...props }: ItemProps<'vocabulary_typed_gap'>) {
  const t = useTranslations('Lesson');
  const label = useGenderLabel();
  const { lang, feedback } = props;
  // Checked: the word the gap wanted, which the reference cards show in green.
  const answers = item.units.map((unit) => feedback?.get(unit.ref)?.answer).filter(Boolean);
  return (
    <ItemCard>
      <ul aria-label={t('wordChoices')} className="mx-auto flex w-full max-w-md flex-col gap-3">
        {item.references.map((word) => {
          // A word in all its forms ("espagnol, espagnole") is right when one of them is.
          const right = word.text.split(', ').some((form) => answers.includes(form));
          return (
            <li
              key={word.ref}
              data-reference={right ? 'answer' : undefined}
              className={`flex min-h-14 items-baseline justify-center gap-3 rounded-lg border px-4 py-3 ${
                right ? 'border-green-500 bg-slate-900' : 'border-slate-800 bg-slate-900'
              }`}
            >
              <span
                lang={lang}
                className={`text-lg ${right ? 'text-green-400' : 'text-slate-100'}`}
              >
                {word.text}
              </span>
              {word.genders.length > 0 ? (
                <span className="text-xs text-slate-400">
                  {word.genders.map((g) => label(g)).join(' / ')}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <Units units={item.units} {...props} />
      {/* After Check, the right word, to hear it. */}
      {answers.map((answer) => (
        <Listen key={answer} text={answer!} lang={lang} small />
      ))}
    </ItemCard>
  );
}

type TextUnit = Extract<UnitView, { kind: 'text' }>;

/** The genders a plural answer can name: the course language's. */
const genders = (lang: Language): Gender[] =>
  lang === 'de' ? ['masculine', 'feminine', 'neuter'] : ['masculine', 'feminine'];

/**
 * One row of the translation exam: the word in the mother tongue, the
 * article badge, the field. A noun's answer without its article holds the
 * first Next once with a note; a "des ..." answer asks for its gender.
 */
function ExamRow({
  unit,
  lang,
  answers,
  onAnswer,
  locked,
  onGate,
}: AnswerProps & { unit: TextUnit }) {
  const t = useTranslations('Lesson');
  const label = useGenderLabel();
  const answer = answers[unit.ref];
  const text = answer && 'text' in answer ? answer.text : '';
  const gender = answer && 'gender' in answer ? answer.gender : undefined;
  const typed = text.trim() !== '';
  const hasArticle = typed && lessons.player.startsWithArticle(text, lang);
  // undefined: no badge (a course language with no article hint).
  const wants = unit.article === undefined ? undefined : unit.article !== null;
  const off = typed && wants !== undefined && hasArticle !== wants;
  const plural = lessons.player.isPluralAnswer(text);

  useGate(
    onGate,
    `article:${unit.ref}`,
    wants && typed && !hasArticle ? { message: t('typeArticle'), mode: 'warn' } : null,
  );

  const prompt = unit.prompt.native ?? unit.prompt.learning ?? '';
  return (
    <div
      data-unit={unit.ref}
      className="grid items-center gap-x-6 gap-y-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]"
    >
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-lg text-slate-100">{prompt}</span>
        {wants === undefined ? null : (
          <span
            data-article-badge={off ? 'off' : 'on'}
            className={`rounded-full border px-2.5 py-0.5 text-xs ${
              off ? 'border-red-500 bg-red-500/10 text-red-300' : 'border-slate-600 text-slate-400'
            }`}
          >
            {wants ? t('withArticle') : t('withoutArticle')}
          </span>
        )}
        {/* Either form is right: the question does not say which (japonais, japonaise). */}
        {unit.eitherGender ? (
          <span
            data-either-gender
            className="rounded-full border border-slate-600 px-2.5 py-0.5 text-xs text-slate-400"
          >
            {t('eitherGender')}
          </span>
        ) : null}
      </p>
      <input
        type="text"
        maxLength={300}
        lang={lang}
        value={text}
        disabled={locked}
        aria-label={prompt}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        onChange={(e) => {
          const next = e.target.value;
          if (next === '') return onAnswer(unit.ref, undefined);
          // The gender stays with a plural answer only.
          const keep = gender && lessons.player.isPluralAnswer(next) ? { gender } : {};
          onAnswer(unit.ref, { text: next, ...keep });
        }}
        className="min-h-11 w-full min-w-0 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-slate-100 disabled:opacity-90"
      />
      {plural ? (
        <div
          role="radiogroup"
          aria-label={t('pluralGender', { text: text.trim() })}
          onKeyDown={radioArrows}
          className="flex flex-wrap gap-2 sm:col-start-2"
        >
          {genders(lang).map((g, index) => {
            const chosen = gender === g;
            return (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={chosen}
                tabIndex={rovingTab(chosen, index, gender !== undefined)}
                disabled={locked}
                onClick={() => onAnswer(unit.ref, { text, gender: g })}
                className={`min-h-11! rounded-full! border px-4! py-2! text-sm transition-colors ${
                  chosen
                    ? 'border-indigo-400 bg-indigo-500/25 text-slate-100'
                    : 'border-slate-700 text-slate-200 hover:bg-slate-800'
                }`}
              >
                {label(g)}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// An exam page: no feedback until the results.
function TranslationExam({ item, ...props }: ItemProps<'vocabulary_translation_exam'>) {
  return (
    <ItemCard>
      {item.units.map((unit) => (
        <ExamRow key={unit.ref} unit={unit} {...props} />
      ))}
    </ItemCard>
  );
}

export const vocabularyRenderers: ItemRenderers = {
  vocabulary_introduction: Introduction,
  vocabulary_flashcards: Cards,
  vocabulary_matching: Matching,
  vocabulary_gender_select: Genders,
  vocabulary_typed_gap: TypedGap,
  vocabulary_translation_exam: TranslationExam,
};
