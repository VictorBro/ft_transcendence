'use client';

import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { Language } from '@ft/shared';

import { pick } from '@/lib/localized';
import {
  clock,
  markKeywords,
  readSkim,
  secondsLeft,
  skimValue,
  type SkimState,
} from '@/lib/reading';
import { MatchingBoard } from '../board';
import { ChoiceControl, outcomeTone } from '../controls';
import { Flashcards } from '../flashcards';
import type { AnswerProps, ItemProps, ItemRenderers, Ref, UnitFeedback, UnitView } from '../types';
import { ItemCard } from '../units';

/**
 * The reading kind's renderers (#148), built after the screens in
 * docs/mockups/lessons/reading/: the key words as B3 flashcards and on
 * the B2 board, the document with its key words marked, the skim
 * countdown and its question from memory, the detail questions and the
 * B1 order control beside the document, and the exam on the second
 * document. The host finds them by item type in the registry.
 *
 * A page's items are rendered one by one, so the skim document and its
 * question never talk to each other: while the document is open it is
 * marked `data-skim="reading"`, and lesson.css hides the question for as
 * long as that mark is on the page.
 */

type ChoiceUnit = Extract<UnitView, { kind: 'choice' }>;
type OrderUnit = Extract<UnitView, { kind: 'order' }>;
type DocumentItem = ItemProps<'reading_document'>['item'];

/** The key of the skim countdown among the attempt's kept values: one skim page per lesson. */
const SKIM_KEY = 'reading:skim';

/* ------------------------------------------------------------ key words */

function ReadingFlashcards({ item, lang, hold }: ItemProps<'reading_flashcards'>) {
  // The meanings on the front, the key word on the back. The view sends no
  // explanation for a key word, so the back has none.
  return (
    <Flashcards
      lang={lang}
      hold={hold}
      cards={item.cards.map((card) => ({
        ref: card.ref,
        front: card.translations.join(' / '),
        text: card.text,
      }))}
    />
  );
}

function KeywordMatching({ item, ...props }: ItemProps<'reading_keyword_matching'>) {
  return (
    <ItemCard>
      <MatchingBoard units={item.units} layout="pairs" speak {...props} />
    </ItemCard>
  );
}

/* ------------------------------------------------------------- document */

/**
 * The document: its title, the small lines above it, then the paragraphs
 * with the key words marked. `labelled` is false when the region around
 * it already carries the name.
 */
function DocumentText({
  document,
  lang,
  labelled = true,
}: {
  document: DocumentItem['document'];
  lang: Language;
  labelled?: boolean;
}) {
  const t = useTranslations('Lesson');
  return (
    <article
      className="reading-document"
      lang={lang}
      aria-label={labelled ? t('readingDocument') : undefined}
    >
      {document.title ? <h2 className="reading-title">{document.title}</h2> : null}
      {document.meta.length > 0 ? (
        <p className="reading-meta">
          {document.meta.map((line, n) => (
            <span key={n}>{line}</span>
          ))}
        </p>
      ) : null}
      {document.paragraphs.map((paragraph, n) => (
        <p key={n} className="reading-paragraph">
          {markKeywords(paragraph, document.highlights).map((segment, m) =>
            segment.mark ? (
              <mark key={m} className="reading-keyword">
                {segment.text}
              </mark>
            ) : (
              segment.text
            ),
          )}
        </p>
      ))}
    </article>
  );
}

function ReadingDocument(props: ItemProps<'reading_document'>) {
  const t = useTranslations('Lesson');
  const { item, lang } = props;
  if (item.view === 'skim') return <SkimDocument {...props} />;
  // Detail, structure and the exam: the document stays open, beside the
  // questions from 700 px of task width (lesson.css). There it scrolls on
  // its own, and nothing inside takes the focus: the box itself does, so
  // a keyboard reaches the end of a long text (WebKit does not focus a
  // scroller by itself).
  return (
    <section
      className="reading-doc-slot is-side"
      data-reading-document={item.view}
      role="region"
      aria-label={t('readingDocument')}
      tabIndex={0}
    >
      <DocumentText document={item.document} lang={lang} labelled={false} />
    </section>
  );
}

/**
 * The skim view: the document with the "Time to skim" countdown and
 * I've finished reading. Either one puts it away and opens the question;
 * Check stays disabled until then. Once checked, the document is back
 * above the question.
 */
function SkimDocument({ item, lang, hold, keep, feedback }: ItemProps<'reading_document'>) {
  const seconds = item.skimSeconds ?? 60;
  // Null until hydration: the browser's clock and storage come after.
  const [state, setState] = useState<SkimState | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const root = useRef<HTMLElement>(null);
  // Set when the document is put away: the question's heading takes the focus once it opens.
  const focusQuestion = useRef(false);

  function open(byHand: boolean) {
    const next: SkimState = { phase: 'question' };
    keep.save(SKIM_KEY, skimValue(next));
    // I've finished reading moves the focus. So does the countdown, when the
    // focus is on <body> or in the task (the page's heading, the document,
    // the held Check): the document going away would drop it, or leave it
    // where nothing says the question has opened. Focus elsewhere on the
    // page (the header, a menu) stays where it is.
    const active = document.activeElement;
    focusQuestion.current =
      byHand ||
      active === null ||
      active === document.body ||
      !!root.current?.closest('.lesson-task')?.contains(active);
    setState(next);
  }
  const timeUp = useEffectEvent(() => open(false));

  // After hydration: the kept countdown, or a new one.
  useEffect(() => {
    const at = Date.now();
    const kept = readSkim(keep.load(SKIM_KEY), at, seconds);
    keep.save(SKIM_KEY, skimValue(kept));
    setState(kept);
    setNow(at);
  }, [keep, seconds]);

  // A deadline, not a count of ticks: a hidden tab gets its timers throttled.
  const deadline = state?.phase === 'reading' ? state.deadline : null;
  useEffect(() => {
    if (deadline === null) return;
    const tick = () => {
      const at = Date.now();
      setNow(at);
      if (secondsLeft(deadline, at) === 0) timeUp();
    };
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [deadline]);

  const reading = state?.phase !== 'question';
  useEffect(() => {
    hold('skim', reading && feedback === null ? { kind: 'block' } : null);
    return () => hold('skim', null);
  }, [hold, reading, feedback]);

  useEffect(() => {
    if (reading || !focusQuestion.current) return;
    focusQuestion.current = false;
    root.current
      ?.closest('.lesson-items')
      ?.querySelector<HTMLElement>('[data-skim-heading]')
      ?.focus();
  }, [reading]);

  const left = deadline !== null && now !== null ? secondsLeft(deadline, now) : seconds;

  // Before hydration the kept state is unknown: after a reload the skim
  // may be over. Nothing of the document is drawn until it is read, but
  // the page stays marked as reading, so the question stays hidden and
  // Check held.
  if (state === null && feedback === null) {
    return <section ref={root} className="reading-doc-slot" data-skim="reading" aria-busy="true" />;
  }

  // Once checked, the document is back above the question.
  if (feedback !== null) {
    return (
      <section ref={root} className="reading-doc-slot" data-skim="checked">
        <DocumentText document={item.document} lang={lang} />
      </section>
    );
  }
  // Put away while the question is open.
  if (!reading) return <section ref={root} data-skim="question" hidden />;

  return (
    <section ref={root} className="reading-doc-slot flex flex-col gap-6" data-skim="reading">
      <SkimOpen
        document={item.document}
        lang={lang}
        seconds={seconds}
        left={left}
        onFinish={() => open(true)}
      />
    </section>
  );
}

/**
 * The open skim page as drawn once hydrated: the countdown with `left` of
 * its `seconds`, I've finished reading, the document and the line saying
 * when the question opens. Exported for the component test, which renders
 * no effect and so never gets past the empty page before hydration.
 */
export function SkimOpen({
  document,
  lang,
  seconds,
  left,
  onFinish,
}: {
  document: DocumentItem['document'];
  lang: Language;
  seconds: number;
  left: number;
  onFinish: () => void;
}) {
  const t = useTranslations('Lesson');
  return (
    <>
      <div className="reading-skim-bar">
        <div
          role="timer"
          aria-label={t('timeToSkim')}
          className="lesson-countdown reading-countdown grid gap-1 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3"
        >
          <span className="text-sm text-slate-400">{t('timeToSkim')}</span>
          <span
            data-testid="skim-time-left"
            className="text-2xl font-semibold text-slate-100 tabular-nums"
          >
            {clock(left)}
          </span>
          <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-slate-800">
            <span
              className="block h-full rounded-full bg-cyan-300"
              style={{ width: `${Math.min(100, (left / seconds) * 100)}%` }}
            />
          </span>
        </div>
        <button
          type="button"
          onClick={onFinish}
          className="min-h-11 rounded-md border border-slate-700 bg-slate-900 px-5 py-2 text-slate-100 transition-colors hover:bg-slate-800"
        >
          {t('finishedReading')}
        </button>
      </div>
      <DocumentText document={document} lang={lang} />
      <p className="reading-locked text-slate-400">{t('questionOpens')}</p>
    </>
  );
}

/* ------------------------------------------------------------ questions */

/**
 * The correction under a checked question, as on the screens: Correct,
 * or Incorrect with the right answer in green, the learner's struck in
 * red, and why.
 */
function ReadingNote({
  feedback,
  yours,
  lang,
}: {
  feedback: UnitFeedback;
  yours: string | null;
  lang: Language;
}) {
  const t = useTranslations('Lesson');
  const locale = useLocale();
  const right = feedback.outcome === 'fully_correct';
  return (
    <div
      className={`reading-note ${right ? 'is-right' : 'is-wrong'}`}
      data-outcome={feedback.outcome}
    >
      <p className={`flex items-center gap-2 text-slate-100 ${right ? '' : 'font-semibold'}`}>
        {/* The ✓ and ✕ of the screens, drawn: not every font has the glyphs. */}
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-3.5 shrink-0"
        >
          <path d={right ? 'M3 8.5 6.5 12 13 4.5' : 'M4 4l8 8M12 4l-8 8'} />
        </svg>
        {right ? t('correct') : t('incorrect')}
      </p>
      {right ? null : (
        <>
          {/* The colours and the line-through say which is which; a screen reader hears it. */}
          <p className="font-semibold text-green-400">
            <span className="sr-only">{t('correctAnswer')}: </span>
            <span lang={lang}>{feedback.answer}</span>
          </p>
          {yours ? (
            <p className="text-red-400 line-through">
              <span className="sr-only">{t('yourAnswer')}: </span>
              <span lang={lang}>{yours}</span>
            </p>
          ) : null}
          <p className="text-slate-400">{pick(feedback.explanation, locale)}</p>
        </>
      )}
    </div>
  );
}

/** One question with choices: the question in the course language, the options, and once checked its note. */
function Question({
  unit,
  lang,
  answers,
  onAnswer,
  feedback,
  locked,
}: AnswerProps & { unit: ChoiceUnit }) {
  const promptId = useId();
  const value = answers[unit.ref];
  const note = feedback?.get(unit.ref);
  const picked = value && 'option' in value ? value.option : undefined;
  const yours = unit.options.find((o) => o.ref === picked)?.text ?? null;
  return (
    <div data-unit={unit.ref} className="reading-question flex flex-col gap-3">
      <p id={promptId} lang={lang} className="reading-question-prompt">
        {unit.prompt.learning}
      </p>
      <ChoiceControl
        // The question is above: the control gets the options only, and its group is named after it.
        unit={{ ...unit, prompt: {} }}
        labelledBy={promptId}
        value={value}
        onChange={(answer) => onAnswer(unit.ref, answer)}
        feedback={note}
        locked={locked}
        lang={lang}
      />
      {note ? <ReadingNote feedback={note} yours={yours} lang={lang} /> : null}
    </div>
  );
}

function Questions({ units, ...props }: AnswerProps & { units: UnitView[] }) {
  return (
    <section className="lesson-item reading-questions flex flex-col gap-5">
      {units.map((unit) =>
        unit.kind === 'choice' ? <Question key={unit.ref} unit={unit} {...props} /> : null,
      )}
    </section>
  );
}

function ReadingChoice({ item, ...props }: ItemProps<'reading_choice'>) {
  return <Questions units={item.units} {...props} />;
}

function ReadingTrueFalse({ item, ...props }: ItemProps<'reading_true_false'>) {
  return <Questions units={item.units} {...props} />;
}

/** The skim question, answered from memory: hidden by lesson.css while the document is open. */
function SkimChoice({ item, ...props }: ItemProps<'reading_skim_choice'>) {
  const t = useTranslations('Lesson');
  return (
    <section className="lesson-item reading-skim-question flex flex-col gap-5">
      <h2 data-skim-heading tabIndex={-1} className="text-2xl font-semibold outline-none">
        {t('answerFromMemory')}
      </h2>
      {item.units.map((unit) =>
        unit.kind === 'choice' ? <Question key={unit.ref} unit={unit} {...props} /> : null,
      )}
    </section>
  );
}

/* -------------------------------------------------------------- order */

/**
 * B1's order control for whole sentences: a tap moves a piece from the
 * pieces below to the order above, and back. Once checked: the right
 * order in green, the learner's struck in red, and why.
 */
function OrderPieces({
  unit,
  lang,
  answers,
  onAnswer,
  feedback,
  locked,
}: AnswerProps & { unit: OrderUnit }) {
  const t = useTranslations('Lesson');
  const orderId = useId();
  const value = answers[unit.ref];
  const placed = value && 'tokens' in value ? value.tokens : [];
  const text = (ref: Ref) => unit.tokens.find((x) => x.ref === ref)?.text ?? '';
  const left = unit.tokens.filter((x) => !placed.includes(x.ref));
  const set = (tokens: Ref[]) => onAnswer(unit.ref, tokens.length ? { tokens } : undefined);
  const note = feedback?.get(unit.ref);
  const piece =
    'reading-piece min-h-11 rounded-md border px-4 py-2 text-center disabled:cursor-default';

  return (
    <div data-unit={unit.ref} className="reading-order flex flex-col gap-4">
      <span id={orderId} className="sr-only">
        {t('yourOrder')}
      </span>
      <ol
        aria-labelledby={orderId}
        lang={lang}
        className={`reading-order-placed flex min-h-16 flex-col items-start gap-2 rounded-md ${
          note ? `border p-2 ${outcomeTone(note.outcome)}` : ''
        }`}
      >
        {placed.map((ref, n) => (
          <li key={ref}>
            <button
              type="button"
              disabled={locked}
              aria-label={t('remove', { text: text(ref) })}
              onClick={() => set(placed.filter((_, m) => m !== n))}
              className={`${piece} border-indigo-400 bg-slate-950 text-slate-100`}
            >
              {text(ref)}
            </button>
          </li>
        ))}
      </ol>
      <div
        lang={lang}
        role="group"
        aria-label={t('piecesToPlace')}
        // Once checked, an empty bank is only the rule above the note, as on the screen.
        className={`reading-order-bank flex flex-col items-start gap-2 border-t border-slate-800 pt-4 ${
          locked && left.length === 0 ? '' : 'min-h-16'
        }`}
      >
        {left.map((token) => (
          <button
            key={token.ref}
            type="button"
            disabled={locked}
            onClick={() => set([...placed, token.ref])}
            className={`${piece} border-slate-700 bg-slate-950 text-slate-100 hover:bg-slate-900 disabled:opacity-60`}
          >
            {token.text}
          </button>
        ))}
      </div>
      {note ? (
        <ReadingNote
          feedback={note}
          yours={placed.length ? placed.map(text).join(' → ') : null}
          lang={lang}
        />
      ) : null}
    </div>
  );
}

function ReadingOrder({ item, ...props }: ItemProps<'reading_order'>) {
  return (
    <section className="lesson-item reading-questions flex flex-col gap-5">
      {item.units.map((unit) =>
        unit.kind === 'order' ? <OrderPieces key={unit.ref} unit={unit} {...props} /> : null,
      )}
    </section>
  );
}

export const readingRenderers: ItemRenderers = {
  reading_flashcards: ReadingFlashcards,
  reading_keyword_matching: KeywordMatching,
  reading_document: ReadingDocument,
  reading_skim_choice: SkimChoice,
  reading_choice: ReadingChoice,
  reading_true_false: ReadingTrueFalse,
  reading_order: ReadingOrder,
};
