'use client';

import { useEffect, useId } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { lessons } from '@ft/shared';

import { pick } from '@/lib/localized';
import { MatchingBoard } from '../board';
import { Flashcards } from '../flashcards';
import { GenderPage } from '../gender-page';
import { RichText } from '../rich-text';
import { ListenButton } from '../speech';
import type { Answer, AnswerProps, ItemProps, ItemRenderers, UnitView } from '../types';
import { ItemCard, Units } from '../units';

/**
 * The vocabulary kind's renderers (#147): the introduction, B3 flashcards,
 * the matching on the B2 board, the B4 gender page, the typed gaps with
 * their reference cards, and the translation exam with its article badge.
 * The host finds them by item type in the registry.
 */

function Introduction({ item, lang }: ItemProps<'vocabulary_introduction'>) {
  const locale = useLocale();
  return (
    <ItemCard>
      <RichText source={pick(item.text, locale)} lang={lang} />
    </ItemCard>
  );
}

function VocabularyFlashcards({ item, lang, hold }: ItemProps<'vocabulary_flashcards'>) {
  return (
    <Flashcards
      lang={lang}
      hold={hold}
      cards={item.cards.map((card) => ({
        ref: card.ref,
        front: card.translations.join(', '),
        text: card.text,
        example: card.example,
      }))}
    />
  );
}

function Matching({ item, ...props }: ItemProps<'vocabulary_matching'>) {
  return (
    <ItemCard>
      <MatchingBoard units={item.units} layout="pairs" speak {...props} />
    </ItemCard>
  );
}

function GenderSelect({ item, ...props }: ItemProps<'vocabulary_gender_select'>) {
  return <GenderPage units={item.units} {...props} />;
}

/** One gender pill label per gender of the course language. */
function useGenderLabel() {
  const genders = useTranslations('Genders');
  return (gender: string) => (genders.has(gender) ? genders(gender) : gender);
}

/** "J'ouvre un ___ de français." with the four words to choose from above it. */
function TypedGap({ item, lang, feedback, ...props }: ItemProps<'vocabulary_typed_gap'>) {
  const genderLabel = useGenderLabel();
  const note = item.units[0] ? feedback?.get(item.units[0].ref) : undefined;
  const same = (a: string, b: string) =>
    lessons.player.normalizeAnswer(a) === lessons.player.normalizeAnswer(b);
  const unit = item.units[0];
  // No space before a full stop or a comma: "Je lis un livre."
  const sentence =
    note && unit
      ? [unit.prompt.before, note.answer, unit.prompt.after]
          .filter(Boolean)
          .join(' ')
          .replace(/ ([.,])/g, '$1')
      : null;
  return (
    <ItemCard>
      <ul className="lesson-reference-cards">
        {item.references.map((reference) => {
          const right = note !== undefined && same(reference.text, note.answer);
          return (
            <li key={reference.ref} className={`lesson-reference-card ${right ? 'is-right' : ''}`}>
              <span lang={lang} className={right ? 'text-green-400' : 'text-slate-100'}>
                {reference.text}
              </span>
              {reference.genders.length > 0 ? (
                <span className="text-sm text-slate-400">
                  {reference.genders.map(genderLabel).join(' / ')}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <Units units={item.units} lang={lang} feedback={feedback} {...props} />
      {sentence ? (
        // The sentence with its right word, to hear it once checked.
        <p className="flex items-center gap-3 text-slate-400">
          <ListenButton text={sentence} lang={lang} size="sm" />
          <span lang={lang}>{sentence}</span>
        </p>
      ) : null}
    </ItemCard>
  );
}

type TextUnit = Extract<UnitView, { kind: 'text' }>;
type TypedAnswer = Extract<Answer, { gender?: unknown }>;
type Gender = NonNullable<TypedAnswer['gender']>;

/**
 * One word of the translation exam: the prompt, the article badge, the
 * field, the note when the article is missing (on the first Next), and the
 * gender pills after a "des ..." answer.
 */
function ExamWord({
  unit,
  lang,
  answers,
  onAnswer,
  locked,
  hold,
  nudged,
}: Omit<AnswerProps, 'feedback' | 'shared' | 'share'> & { unit: TextUnit }) {
  const t = useTranslations('Lesson');
  const genders: Gender[] =
    lang === 'de' ? ['masculine', 'feminine', 'neuter'] : ['masculine', 'feminine'];
  const genderLabel = useGenderLabel();
  const id = useId();
  const value = answers[unit.ref];
  const typed = value && 'text' in value && !('token' in value) ? (value as TypedAnswer) : null;
  const text = typed?.text ?? '';
  const gender = typed?.gender;
  const wantsArticle = unit.article !== null && unit.article !== undefined;
  const missing =
    wantsArticle && text.trim() !== '' && !lessons.player.startsWithArticle(text, lang);
  const plural = lessons.player.isPluralAnswer(text);

  useEffect(() => {
    hold(`article:${unit.ref}`, missing ? { kind: 'nudge' } : null);
    return () => hold(`article:${unit.ref}`, null);
  }, [hold, unit.ref, missing]);

  const set = (next: Partial<TypedAnswer>) => {
    const merged: TypedAnswer = { text, ...(gender ? { gender } : {}), ...next };
    if (!lessons.player.isPluralAnswer(merged.text)) delete merged.gender;
    onAnswer(unit.ref, merged.text === '' && !merged.gender ? undefined : merged);
  };

  return (
    <div className="lesson-exam-word" data-unit={unit.ref}>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-slate-100">{unit.prompt.native ?? unit.prompt.learning}</span>
        {unit.article !== undefined ? (
          <span className={`lesson-article-badge ${missing && nudged ? 'is-missing' : ''}`}>
            {t(wantsArticle ? 'withArticle' : 'withoutArticle')}
          </span>
        ) : null}
      </p>
      <div className="flex min-w-0 flex-col gap-2">
        <input
          type="text"
          maxLength={300}
          lang={lang}
          value={text}
          disabled={locked}
          aria-label={unit.prompt.native ?? unit.prompt.learning ?? t('yourAnswer')}
          aria-describedby={missing && nudged ? id : undefined}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => set({ text: e.target.value })}
          className={`min-h-11 w-full min-w-0 rounded-md border bg-slate-950 px-3 py-2 text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-slate-100 ${
            missing && nudged ? 'border-red-500' : 'border-slate-700'
          }`}
        />
        {missing && nudged ? (
          <p id={id} role="status" className="text-sm text-red-300">
            {t('typeTheArticle')}
          </p>
        ) : null}
        {plural ? (
          <div role="radiogroup" aria-label={t('whichGender')} className="flex flex-wrap gap-2">
            {genders.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={gender === option}
                disabled={locked}
                onClick={() => set({ gender: option })}
                className={`lesson-pill ${gender === option ? 'is-chosen' : ''}`}
              >
                {genderLabel(option)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TranslationExam({ item, ...props }: ItemProps<'vocabulary_translation_exam'>) {
  return (
    <ItemCard>
      {item.units.map((unit) =>
        unit.kind === 'text' ? <ExamWord key={unit.ref} unit={unit} {...props} /> : null,
      )}
    </ItemCard>
  );
}

export const vocabularyRenderers: ItemRenderers = {
  vocabulary_introduction: Introduction,
  vocabulary_flashcards: VocabularyFlashcards,
  vocabulary_matching: Matching,
  vocabulary_gender_select: GenderSelect,
  vocabulary_typed_gap: TypedGap,
  vocabulary_translation_exam: TranslationExam,
};
