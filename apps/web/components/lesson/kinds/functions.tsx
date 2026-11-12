'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { Language } from '@ft/shared';

import { pick } from '@/lib/localized';
import { MatchingBoard } from '../board';
import { radioArrows, rovingTab, TextControl } from '../controls';
import { Flashcards } from '../flashcards';
import { GenderPage } from '../gender-page';
import { ListenButton, useSpeech } from '../speech';
import type { ItemProps, ItemRenderers, LessonOutline, UnitView } from '../types';
import { ItemCard, Units } from '../units';
import { TranslationExam, useGenderLabel } from './vocabulary';

/**
 * The functions kind's renderers (#149): expression and word flashcards,
 * the model dialogue line by line, matching, gender, the dialogue gaps,
 * word order, the listening reply, and the three-part exam (translation,
 * replies, the dialogue with typed gaps). The host finds them by item type
 * in the registry.
 */

/** A dialogue line of a prompt, "Marc: Bonjour !", split into its role and its text. */
function splitLine(line: string | undefined, outline: LessonOutline) {
  const text = line ?? '';
  const role = (outline.roles ?? []).find((r) => text.startsWith(`${r}: `));
  return role ? { role, text: text.slice(role.length + 2) } : { role: undefined, text };
}

/** The role that answers: the other one of the two. */
const otherRole = (role: string | undefined, outline: LessonOutline) =>
  role === undefined ? undefined : (outline.roles ?? []).find((r) => r !== role);

function RoleLabel({ children }: { children: ReactNode }) {
  return <p className="lesson-role">{children}</p>;
}

/** A line of the dialogue that opens an exercise: the role, Listen, and the line. */
function Opener({ role, text, lang }: { role?: string; text: string; lang: Language }) {
  if (!text) return null;
  return (
    <div className="flex flex-col gap-2">
      {role ? <RoleLabel>{role}</RoleLabel> : null}
      <p className="flex items-center gap-3">
        <ListenButton text={text} lang={lang} size="sm" />
        <span lang={lang} className="text-lg text-slate-100">
          {text}
        </span>
      </p>
    </div>
  );
}

/** A dialogue line with the lesson's expressions in it marked, as on the screen. */
function Marked({ text, highlights }: { text: string; highlights: string[] }) {
  const out: ReactNode[] = [];
  let rest = text;
  let at = 0;
  for (const mark of highlights) {
    const n = rest.indexOf(mark);
    if (n < 0) continue;
    if (n > 0) out.push(rest.slice(0, n));
    out.push(
      <strong key={at + n} className="lesson-expression-mark">
        {mark}
      </strong>,
    );
    rest = rest.slice(n + mark.length);
    at += n + mark.length;
  }
  if (rest) out.push(rest);
  return <>{out}</>;
}

/** Brings a line that Next line adds into view; not the first ones, which come with the page. */
function useNewestLine(shown: number) {
  const list = useRef<HTMLOListElement>(null);
  const before = useRef(shown);
  useEffect(() => {
    if (shown > before.current) {
      list.current?.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    before.current = shown;
  }, [shown]);
  return list;
}

function FunctionFlashcards({ item, lang, hold }: ItemProps<'function_flashcards'>) {
  const locale = useLocale();
  const genderLabel = useGenderLabel();
  return (
    <Flashcards
      lang={lang}
      hold={hold}
      cards={item.cards.map((card) => ({
        ref: card.ref,
        front: card.translations.join(', '),
        text: card.text,
        explanation: card.explanation
          ? pick(card.explanation, locale)
          : card.genders?.length
            ? card.genders.map(genderLabel).join(' / ')
            : undefined,
        example: card.example,
      }))}
    />
  );
}

/**
 * The model dialogue: one line more with each Next line, the page's main
 * button until the last line is out. Each line turns to its translation
 * and a note.
 */
function Dialogue({ item, lang, hold, outline }: ItemProps<'function_dialogue'>) {
  const t = useTranslations('Lesson');
  const locale = useLocale();
  const total = item.lines.length;
  const [shown, setShown] = useState(Math.min(1, total));
  const [turned, setTurned] = useState<ReadonlySet<string>>(new Set());
  const nextLine = useCallback(() => setShown((n) => n + 1), []);
  const first = outline.roles?.[0] ?? item.lines[0]?.role;
  const list = useNewestLine(shown);

  useEffect(() => {
    hold(
      'dialogue',
      shown < total
        ? {
            kind: 'step',
            label: t('nextLine'),
            message: t('lineOf', { n: shown, total }),
            onStep: nextLine,
          }
        : null,
    );
    return () => hold('dialogue', null);
  }, [hold, shown, total, nextLine, t]);

  return (
    <section className="lesson-item">
      <ol ref={list} className="lesson-dialogue">
        {item.lines.slice(0, shown).map((line) => {
          const back = turned.has(line.ref);
          return (
            <li
              key={line.ref}
              data-line={line.ref}
              className={`lesson-dialogue-line ${line.role === first ? '' : 'is-other'}`}
            >
              <button
                type="button"
                className="lesson-flashcard-turn"
                aria-label={t('turnLine', { text: line.text })}
                aria-pressed={back}
                onClick={() =>
                  setTurned((s) => {
                    const next = new Set(s);
                    if (next.has(line.ref)) next.delete(line.ref);
                    else next.add(line.ref);
                    return next;
                  })
                }
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
              <RoleLabel>{line.role}</RoleLabel>
              <p className="flex items-center gap-3">
                <ListenButton text={line.text} lang={lang} size="sm" />
                <span lang={lang} className="text-lg text-slate-100">
                  <Marked text={line.text} highlights={line.highlights} />
                </span>
              </p>
              {back ? (
                <div className="flex flex-col gap-1 text-base">
                  <p className="text-slate-300">{line.translation}</p>
                  <p className="text-slate-400">{pick(line.note, locale)}</p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function FunctionMatching({ item, ...props }: ItemProps<'function_matching'>) {
  return (
    <ItemCard>
      <MatchingBoard units={item.units} layout="pairs" speak {...props} />
    </ItemCard>
  );
}

function FunctionGender({ item, ...props }: ItemProps<'function_gender_select'>) {
  return <GenderPage units={item.units} {...props} />;
}

/** "Léa: Tout le monde est là." above the reply with its gap and the four expressions. */
function DialogueGapChoice({ item, ...props }: ItemProps<'function_dialogue_gap_choice'>) {
  return (
    <ItemCard>
      {item.units.map((unit) => {
        const opener = splitLine(unit.prompt.learning, props.outline);
        const answerer = otherRole(opener.role, props.outline);
        return (
          <div key={unit.ref} className="flex flex-col gap-5">
            <Opener role={opener.role} text={opener.text} lang={props.lang} />
            <div className="flex flex-col gap-2">
              {answerer ? <RoleLabel>{answerer}</RoleLabel> : null}
              <Units units={[unit]} {...props} />
            </div>
          </div>
        );
      })}
    </ItemCard>
  );
}

/**
 * Word order: the words of a sentence (practice), or a reply to a line of
 * the dialogue with words that do not fit mixed in (the exam's replies).
 */
function WordOrder({ item, ...props }: ItemProps<'function_word_order'>) {
  return (
    <ItemCard>
      {item.units.map((unit) => {
        const opener = splitLine(unit.prompt.learning, props.outline);
        const answerer = otherRole(opener.role, props.outline);
        // The line is shown above; the control gets the words only.
        const bare = { ...unit, prompt: {} } as UnitView;
        return (
          <div key={unit.ref} className="flex flex-col gap-5">
            <Opener role={opener.role} text={opener.text} lang={props.lang} />
            <div className="flex flex-col gap-2">
              {answerer ? <RoleLabel>{answerer}</RoleLabel> : null}
              <Units units={[bare]} {...props} />
            </div>
          </div>
        );
      })}
    </ItemCard>
  );
}

/**
 * The listening reply: Listen plays the line, each reply has its own
 * speaker, and Show the text writes them all out. With no voice, Show the
 * text is the only way through, so it is always there.
 */
function ListeningChoice({
  item,
  lang,
  answers,
  onAnswer,
  feedback,
  locked,
  outline,
}: ItemProps<'function_listening_choice'>) {
  const t = useTranslations('Lesson');
  const placement = useTranslations('Placement');
  const [open, setOpen] = useState(false);
  return (
    <ItemCard>
      {item.units.map((unit) => {
        if (unit.kind !== 'choice') return null;
        const line = splitLine(unit.prompt.learning, outline);
        const answerer = otherRole(line.role, outline);
        const value = answers[unit.ref];
        const picked = value && 'option' in value ? value.option : undefined;
        const note = feedback?.get(unit.ref);
        const right = new Set(note?.correct ?? []);
        // Once checked, the texts show: the feedback names them.
        const written = open || note !== undefined;
        return (
          <div key={unit.ref} data-unit={unit.ref} className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              {line.role ? <RoleLabel>{line.role}</RoleLabel> : null}
              <div className="flex flex-wrap items-center gap-3">
                <ListenLine text={unit.speak ?? line.text} lang={lang} />
                <button
                  type="button"
                  aria-pressed={open}
                  onClick={() => setOpen((o) => !o)}
                  className="min-h-11 rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-base text-slate-100 hover:bg-slate-900"
                >
                  {placement('showText')}
                </button>
              </div>
              {written ? (
                <p lang={lang} className="text-lg text-slate-100">
                  {line.text}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-3">
              {answerer ? <RoleLabel>{answerer}</RoleLabel> : null}
              <div
                role="radiogroup"
                aria-label={t('pick')}
                onKeyDown={radioArrows}
                className="flex flex-col gap-3"
              >
                {unit.options.map((option, index) => {
                  const chosen = picked === option.ref;
                  const tone = note
                    ? right.has(option.ref)
                      ? 'border-green-500 bg-green-500/15 text-green-200'
                      : chosen
                        ? 'border-red-500 bg-red-500/15 text-red-200'
                        : 'border-slate-800 bg-slate-900 text-slate-400'
                    : chosen
                      ? 'border-indigo-400 bg-indigo-500/20 text-slate-100'
                      : 'border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800';
                  return (
                    <div key={option.ref} className="lesson-reply">
                      <span className="lesson-reply-listen">
                        <ListenButton text={option.text} lang={lang} size="sm" />
                      </span>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={chosen}
                        tabIndex={rovingTab(chosen, index, picked !== undefined)}
                        disabled={locked}
                        lang={written ? lang : undefined}
                        onClick={() => {
                          if (!chosen) onAnswer(unit.ref, { option: option.ref });
                        }}
                        className={`min-h-12 w-full rounded-md border py-2 pr-4 text-left transition-colors disabled:cursor-default ${tone}`}
                      >
                        {written ? option.text : t('replyN', { n: index + 1 })}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            {note && note.outcome !== 'fully_correct' ? (
              <span className="sr-only" role="status">
                {t('incorrect')}.{' '}
                {t.rich('answerWas', {
                  answer: note.answer,
                  a: (chunks) => <span lang={lang}>{chunks}</span>,
                })}
              </span>
            ) : null}
          </div>
        );
      })}
    </ItemCard>
  );
}

/** The Listen button of the listening reply: a word, as on the screen. Not rendered with no voice. */
function ListenLine({ text, lang }: { text: string; lang: Language }) {
  const t = useTranslations('Lesson');
  const speak = useSpeech(lang);
  if (!speak) return null;
  return (
    <button
      type="button"
      onClick={() => speak(text)}
      data-listen
      className="min-h-11 rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-base text-slate-100 hover:bg-slate-900"
    >
      {t('listen')}
    </button>
  );
}

function FunctionTranslationExam(props: ItemProps<'function_translation_exam'>) {
  return <TranslationExam {...(props as unknown as ItemProps<'vocabulary_translation_exam'>)} />;
}

/** Where the lines shown of an exam dialogue are kept, beside the drafts: by its first gap. */
const linesKey = (ref: string) => `lines:${ref}`;

/**
 * The exam dialogue: it unrolls line by line with Next line, and the last
 * line has Finish the exam. A gap shown stays open until the page is sent.
 * The count of lines shown is kept in this browser, so a reload shows the
 * same lines.
 */
function DialogueGapTyping({
  item,
  lang,
  answers,
  onAnswer,
  locked,
  hold,
  keep,
}: ItemProps<'function_dialogue_gap_typing'>) {
  const t = useTranslations('Lesson');
  const total = item.lines.length;
  const firstGap = item.units[0]?.ref;
  const [shown, setShown] = useState(1);
  const nextLine = useCallback(() => setShown((n) => n + 1), []);
  const list = useNewestLine(shown);

  // After hydration: the storage is the browser's.
  useEffect(() => {
    if (!firstGap) return;
    const kept = Number(keep.load(linesKey(firstGap)));
    if (Number.isInteger(kept) && kept > 0) setShown((n) => Math.max(n, Math.min(kept, total)));
  }, [firstGap, total, keep]);

  useEffect(() => {
    if (firstGap) keep.save(linesKey(firstGap), String(shown));
  }, [firstGap, shown, keep]);

  useEffect(() => {
    hold(
      'dialogue',
      shown < total && !locked
        ? {
            kind: 'step',
            label: t('nextLine'),
            message: t('lineOf', { n: shown, total }),
            onStep: nextLine,
          }
        : null,
    );
    return () => hold('dialogue', null);
  }, [hold, shown, total, nextLine, t, locked]);

  const first = item.lines[0]?.role;
  return (
    <section className="lesson-item">
      <ol ref={list} className="lesson-dialogue">
        {item.lines.slice(0, shown).map((line, n) => {
          const unit = line.gap ? item.units.find((u) => u.ref === line.gap) : undefined;
          return (
            <li
              key={n}
              data-unit={unit?.ref}
              className={`lesson-dialogue-line ${line.role === first ? '' : 'is-other'}`}
            >
              <RoleLabel>{line.role}</RoleLabel>
              {unit && unit.kind === 'text' ? (
                // The gap with the line's text around it (the unit's prompt).
                <TextControl
                  unit={unit}
                  value={answers[unit.ref]}
                  onChange={(answer) => onAnswer(unit.ref, answer)}
                  feedback={undefined}
                  locked={locked}
                  lang={lang}
                />
              ) : (
                <p lang={lang} className="text-lg text-slate-100">
                  {[line.before, line.after].filter(Boolean).join(' ')}
                </p>
              )}
              <p className="text-base text-slate-400">{line.translation}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export const functionsRenderers: ItemRenderers = {
  function_flashcards: FunctionFlashcards,
  function_dialogue: Dialogue,
  function_gender_select: FunctionGender,
  function_matching: FunctionMatching,
  function_word_order: WordOrder,
  function_listening_choice: ListeningChoice,
  function_dialogue_gap_choice: DialogueGapChoice,
  function_translation_exam: FunctionTranslationExam,
  function_dialogue_gap_typing: DialogueGapTyping,
};
