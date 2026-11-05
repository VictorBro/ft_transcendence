'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { lessons, type Language } from '@ft/shared';

import { FormError, PRIMARY_BUTTON } from '@/components/form';
import { ConfirmDialog } from '@/components/lesson/confirm-dialog';
import { ITEM_RENDERERS } from '@/components/lesson/kinds';
import type {
  Answer,
  ItemProps,
  ItemView,
  LessonOutline,
  Ref,
  UnitFeedback,
} from '@/components/lesson/types';
import { ItemCard } from '@/components/lesson/units';
import { Link, useRouter } from '@/i18n/navigation';
import { useErrorMessage } from '@/lib/error-message';
import {
  loadDrafts,
  newerAttempt,
  readAttempt,
  rememberAttempt,
  saveDrafts,
  submitPage,
  clearDrafts,
} from '@/lib/lesson-client';
import { pick } from '@/lib/localized';
import { ExamTimer } from './exam-timer';

type AttemptView = lessons.player.AttemptView;
type PageView = NonNullable<AttemptView['current']>;

/** How long the green flash of a page right at once lasts, before the next page. */
const FLASH_MS = 700;

/** The units of a page, by item: what its answers are keyed by. */
const unitRefs = (page: PageView): Ref[] =>
  page.items.flatMap((item) => ('units' in item ? item.units.map((u) => u.ref) : []));

/** A practice page checked: its feedback, and the attempt the server moved to. */
interface Checked {
  feedback: Map<Ref, UnitFeedback>;
  next: AttemptView;
}

/**
 * The player: renders the attempt the server sends and never scores.
 * Each move (Check, Continue, Start the exam, Next, the countdown at
 * zero) posts the page at the cursor and renders what comes back. Pages
 * inside the player never touch the history: Back leaves the player.
 */
export function LessonPlayer({
  lang,
  id,
  outline,
  initial,
  pagePath,
  resultsPath,
}: {
  lang: Language;
  id: string;
  outline: LessonOutline;
  initial: AttemptView;
  pagePath: string;
  resultsPath: string;
}) {
  const t = useTranslations('Lesson');
  const locale = useLocale();
  const router = useRouter();
  const errorMessage = useErrorMessage();

  const [view, setView] = useState(initial);
  // When the view arrived, in this tab's clock: the exam's time left counts from it.
  const [receivedAt, setReceivedAt] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<Ref, Answer>>({});
  const [checked, setChecked] = useState<Checked | null>(null);
  const [flash, setFlash] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);
  // The page index a post is running or done for: a timer at zero and a click cannot both send it.
  const sent = useRef<number | null>(null);

  const page = view.current;

  // After hydration: the newer of the rendered attempt and the one this tab
  // saw last (Forward shows the page as first rendered), and the drafts.
  useEffect(() => {
    const now = Date.now();
    const newer = newerAttempt(lang, id, initial, now);
    if (newer.view.current === null) {
      router.replace(resultsPath);
      return;
    }
    setView(newer.view);
    setReceivedAt(newer.at);
    setDrafts(loadDrafts(newer.view.attemptId));
    rememberAttempt(lang, id, newer.view, newer.at);
  }, [lang, id, initial, router, resultsPath]);

  const show = useCallback(
    (next: AttemptView) => {
      setChecked(null);
      setFlash(false);
      setError(null);
      if (next.current === null) {
        clearDrafts(next.attemptId);
        // Replaced, so Back from the results goes to the lesson page.
        router.replace(resultsPath);
        return;
      }
      sent.current = null;
      setView(next);
      setReceivedAt(Date.now());
      top.current?.scrollIntoView({ block: 'start' });
    },
    [router, resultsPath],
  );

  function answer(ref: Ref, value: Answer | undefined) {
    setDrafts((current) => {
      const next = { ...current };
      if (value === undefined) delete next[ref];
      else next[ref] = value;
      saveDrafts(view.attemptId, next);
      return next;
    });
  }

  /** A 409: another tab or an old page. Reads the attempt again and renders it. */
  async function reread(code: string, status: number) {
    const result = await readAttempt(lang, id);
    if (!result.ok || result.data.attempt === null) {
      setError(errorMessage(result.ok ? code : result.code, result.ok ? status : result.status));
      return;
    }
    rememberAttempt(lang, id, result.data.attempt);
    show(result.data.attempt);
    setError(errorMessage(code, status));
  }

  async function post() {
    if (!page || sent.current === page.index) return;
    sent.current = page.index;
    const refs = new Set(unitRefs(page));
    const answers = Object.fromEntries(
      Object.entries(drafts).filter(([ref]) => refs.has(ref)),
    ) as Record<Ref, Answer>;

    setPending(true);
    setError(null);
    const result = await submitPage(lang, id, page.index, view.attemptId, answers);
    setPending(false);

    if (!result.ok) {
      sent.current = null;
      if (result.status === 409) return reread(result.code, result.status);
      setError(errorMessage(result.code, result.status));
      return;
    }

    const { feedback, attempt } = result.data;
    rememberAttempt(lang, id, attempt);
    // The page is locked on the server: its drafts are done with.
    const rest = Object.fromEntries(Object.entries(drafts).filter(([ref]) => !refs.has(ref)));
    saveDrafts(view.attemptId, rest);

    if (feedback === null || page.role !== 'practice') {
      setDrafts(rest);
      show(attempt);
      return;
    }

    const byRef = new Map(feedback.map((f) => [f.ref, f]));
    setChecked({ feedback: byRef, next: attempt });
    // Right at once on a page whose items all allow it: a green flash, then on.
    const allRight = feedback.every((f) => f.outcome === 'fully_correct');
    const skip = page.items.every((item) => lessons.player.typeSkipsFeedbackWhenRight(item.type));
    if (allRight && skip) {
      setFlash(true);
      window.setTimeout(() => {
        setDrafts(rest);
        show(attempt);
      }, FLASH_MS);
    }
  }

  function next() {
    if (!checked) return;
    setDrafts((current) => {
      const refs = page ? new Set(unitRefs(page)) : new Set<string>();
      return Object.fromEntries(Object.entries(current).filter(([ref]) => !refs.has(ref)));
    });
    show(checked.next);
  }

  if (page === null) {
    // On the way to the results.
    return null;
  }

  const exam = page.role === 'exam';
  const examPages = outline.pages.filter((p) => p.role === 'exam');
  const lastExam = exam && page.index === outline.pages.length - 1;
  // Ran out while the learner was away: the page shows, locked, until Next.
  const ranOut = exam && view.remainingMs === 0;
  const locked = pending || checked !== null || ranOut;

  const props = {
    lang,
    answers: drafts,
    onAnswer: answer,
    feedback: checked?.feedback ?? null,
    locked,
  };

  const button = (() => {
    if (checked) return { label: t('continue'), onClick: next };
    switch (page.role) {
      case 'practice':
        return { label: t('check'), onClick: post };
      case 'examIntro':
        return { label: t('startExam'), onClick: post };
      case 'exam':
        return { label: lastExam ? t('finishExam') : t('next'), onClick: post };
      default:
        return { label: t('continue'), onClick: post };
    }
  })();

  return (
    <div
      ref={top}
      data-page-index={page.index}
      data-page-role={page.role}
      // open, checked (the feedback shows, Continue next) or flash (on its own to the next page).
      data-state={flash ? 'flash' : checked ? 'checked' : 'open'}
      className="relative -mx-3 -my-3 flex min-w-0 flex-col px-3 py-3 [scrollbar-width:none] lg:h-full lg:overflow-y-auto [&::-webkit-scrollbar]:hidden"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-6 wrap-break-word">
        <PlayerHeader
          outline={outline}
          index={page.index}
          // Checked: the header counts the page's points already.
          practice={checked?.next.practice ?? view.practice}
          exam={exam}
          pagePath={pagePath}
        />

        {exam && receivedAt !== null && view.remainingMs !== null ? (
          <ExamTimer
            key={`${view.attemptId}:${page.index}`}
            deadline={receivedAt + view.remainingMs}
            ranOut={ranOut}
            onZero={post}
          />
        ) : null}

        <h1 className="text-xl font-semibold">{pick(page.instructions, locale)}</h1>

        {ranOut ? (
          <p
            role="status"
            className="rounded-md border border-amber-400/50 bg-amber-400/10 p-3 text-amber-200"
          >
            {t('timeRanOut')}
          </p>
        ) : null}

        {page.role === 'examIntro' ? (
          <ItemCard>
            <h2 className="text-lg font-semibold">{t('exam')}</h2>
            <p className="text-slate-300">
              {t('examInfo', {
                pages: examPages.length,
                questions: examPages.reduce((sum, p) => sum + p.questions, 0),
              })}
            </p>
          </ItemCard>
        ) : null}

        {page.role === 'discussion' ? (
          // #151 fills this slot.
          <section
            data-slot="discussion"
            className="rounded-2xl border border-dashed border-slate-800 p-6 text-slate-400"
          >
            {t('discussionSoon')}
          </section>
        ) : null}

        {page.items.map((item, n) => (
          <Item key={n} item={item} {...props} />
        ))}

        <div className="flex flex-col gap-3">
          <FormError message={error} />
          {checked && !flash ? <CheckedSummary feedback={[...checked.feedback.values()]} /> : null}
          <button
            type="button"
            onClick={button.onClick}
            disabled={pending || flash}
            className={`${PRIMARY_BUTTON} self-end`}
          >
            {button.label}
          </button>
        </div>
      </div>

      {flash ? (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-20 animate-lesson-flash bg-green-500/25"
        />
      ) : null}
      <p role="status" className="sr-only">
        {flash ? t('allRight') : ''}
      </p>
    </div>
  );
}

/** One item, by the renderer its type has in the registry. */
function Item({ item, ...props }: Omit<ItemProps, 'item'> & { item: ItemView }) {
  const t = useTranslations('Lesson');
  const Renderer = ITEM_RENDERERS[item.type] as React.ComponentType<ItemProps> | undefined;
  if (!Renderer) {
    return (
      <ItemCard>
        <p className="text-slate-400">{t('unavailable')}</p>
      </ItemCard>
    );
  }
  return <Renderer item={item} {...props} />;
}

/** A checked page with every answer right says so once, under the items. */
function CheckedSummary({ feedback }: { feedback: UnitFeedback[] }) {
  const t = useTranslations('Lesson');
  const right = feedback.length > 0 && feedback.every((f) => f.outcome === 'fully_correct');
  return right ? <p className="font-semibold text-green-300">{t('allRight')}</p> : null;
}

/**
 * ✕ (Leave the lesson), the progress bar and the header score. The bar
 * follows the outline's page seconds and only shows the way: there is no
 * Previous. During the exam the ✕ asks first, and the score stays still.
 */
function PlayerHeader({
  outline,
  index,
  practice,
  exam,
  pagePath,
}: {
  outline: LessonOutline;
  index: number;
  practice: AttemptView['practice'];
  exam: boolean;
  pagePath: string;
}) {
  const t = useTranslations('Lesson');
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const total = outline.pages.reduce((sum, p) => sum + p.seconds, 0);
  const done = outline.pages.slice(0, index).reduce((sum, p) => sum + p.seconds, 0);
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  const close = (
    <svg
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" strokeLinecap="round" />
    </svg>
  );
  const closeClass =
    'inline-flex size-11 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100';

  return (
    <div className="sticky top-0 z-10 flex items-center gap-4 bg-slate-950/90 py-2 backdrop-blur">
      {exam ? (
        <>
          <button
            type="button"
            aria-label={t('leave')}
            onClick={() => dialog.current?.showModal()}
            className={closeClass}
          >
            {close}
          </button>
          <ConfirmDialog
            ref={dialog}
            label={t('leave')}
            no={t('leaveNo')}
            yes={t('leaveYes')}
            onYes={() => {
              dialog.current?.close();
              router.push(pagePath);
            }}
          >
            {t('leaveConfirm')}
          </ConfirmDialog>
        </>
      ) : (
        <Link href={pagePath} aria-label={t('leave')} className={closeClass}>
          {close}
        </Link>
      )}
      <div
        role="progressbar"
        aria-label={t('progress')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 flex-1 rounded-full bg-slate-800"
      >
        <div
          className="h-full rounded-full bg-indigo-500 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="flex shrink-0 flex-wrap items-baseline justify-end gap-x-2 text-sm">
        {exam ? (
          <span className="rounded-full border border-amber-400/60 px-2 py-0.5 text-xs font-medium text-amber-200">
            {t('exam')}
          </span>
        ) : null}
        <span className="text-slate-400">{t('practice')}</span>
        <span data-testid="header-score" className="font-semibold tabular-nums text-slate-100">
          {t('tally', { earned: practice.earned, possible: practice.possible })}
        </span>
      </p>
    </div>
  );
}
