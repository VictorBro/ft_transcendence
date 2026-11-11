'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { lessons, type Language } from '@ft/shared';

import { FormError, PRIMARY_BUTTON } from '@/components/form';
import { ConfirmDialog } from '@/components/lesson/confirm-dialog';
import { ITEM_RENDERERS } from '@/components/lesson/kinds';
import { LessonNavigation } from '@/components/lesson/navigation';
import type {
  Answer,
  Hold,
  ItemProps,
  ItemView,
  LessonOutline,
  Ref,
  UnitFeedback,
} from '@/components/lesson/types';
import { ItemCard } from '@/components/lesson/units';
import { useRouter } from '@/i18n/navigation';
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
import { recordPlayerOrigin, playerHasLessonOrigin } from '@/lib/lesson-history';
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
  /** When the check was sent: the time base of the next page. */
  at: number;
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
  // Updated synchronously when the cursor moves: an older hydration read must
  // not rewind the player after a submit has finished and released `sent`.
  const activeView = useRef(initial);
  // When the view was asked for, in this tab's clock: the exam's time left
  // counts from it. The request start, not its arrival, so the tab's
  // deadline is never later than the server's.
  const [receivedAt, setReceivedAt] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<Ref, Answer>>({});
  const [checked, setChecked] = useState<Checked | null>(null);
  const [flash, setFlash] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The exam page whose countdown reached zero here: it stays locked, even if its post fails.
  const [timedOut, setTimedOut] = useState<number | null>(null);
  // The drafts came from storage: from then on, they go back to it.
  const [loaded, setLoaded] = useState(false);
  // What the page's items hold the main button back with, by their keys.
  const [holds, setHolds] = useState<Record<string, Hold>>({});
  // The first press met a nudge: the items show their notes, the next press sends.
  const [nudged, setNudged] = useState(false);
  // What the items of the page share; a new page starts empty.
  const [shared, setShared] = useState<Record<string, unknown>>({});
  const top = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // Set when the player moves to another page, so the new page's heading takes the focus.
  const moved = useRef(false);
  // Set once the attempt is over: the drafts are cleared and must not come back.
  const finished = useRef(false);
  // The page index a post is running or done for: a timer at zero and a click cannot both send it.
  const sent = useRef<number | null>(null);
  // The green flash's timer: cleared when the player goes, so it never moves a page no one sees.
  const flashTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  const page = view.current;
  const slot = { lang, id, attemptId: view.attemptId };

  // After hydration: the newer of the rendered attempt and the one this tab
  // saw last (Forward shows the page as first rendered), and the drafts.
  useEffect(() => {
    const now = Date.now();
    const newer = newerAttempt(lang, id, initial, now);
    activeView.current = newer.view;
    if (newer.view.current === null) {
      router.replace(resultsPath);
      return;
    }
    setView(newer.view);
    setDrafts(loadDrafts({ lang, id, attemptId: newer.view.attemptId }));
    setLoaded(true);
    rememberAttempt(lang, id, newer.view, newer.at);

    const current = newer.view.current;
    if (current.role !== 'exam') {
      setReceivedAt(newer.at);
      return;
    }
    // An exam page: the time left it came with is stale. From the server
    // render it was counted before the HTML, the script and the hydration,
    // which can take longer than the server's grace; from this tab's memory
    // (Back, then Resume or Forward) it is as old as the visit. Read it
    // again, timed from the request, before the countdown shows.
    let live = true;
    const asked = Date.now();
    void readAttempt(lang, id).then((result) => {
      if (
        !live ||
        activeView.current.attemptId !== newer.view.attemptId ||
        activeView.current.current?.index !== current.index
      )
        return;
      const fresh = result.ok ? result.data.attempt : null;
      if (
        sent.current !== null ||
        fresh?.attemptId !== newer.view.attemptId ||
        fresh.current?.index !== current.index
      ) {
        // Moved on meanwhile, or no answer: the view in hand, as it came.
        setReceivedAt((at) => at ?? newer.at);
        return;
      }
      activeView.current = fresh;
      setView(fresh);
      setReceivedAt(asked);
      rememberAttempt(lang, id, fresh, asked);
    });
    return () => {
      live = false;
    };
  }, [lang, id, initial, router, resultsPath]);

  // The drafts follow the learner into storage, once loaded and until the attempt is over.
  useEffect(() => {
    if (!loaded || finished.current) return;
    saveDrafts({ lang, id, attemptId: view.attemptId }, drafts);
  }, [lang, id, view.attemptId, drafts, loaded]);

  // A new page: its heading takes the focus, so a screen reader reads where the learner is.
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    heading.current?.focus({ preventScroll: true });
  }, [page?.index]);

  const show = useCallback(
    (next: AttemptView, askedAt: number) => {
      const changedAttempt = next.attemptId !== activeView.current.attemptId;
      if (changedAttempt) {
        // A retake in another tab owns different drafts and countdown state.
        // Update drafts together with the view so the save effect cannot write
        // the previous attempt's answers under the new attempt's key.
        setDrafts(loadDrafts({ lang, id, attemptId: next.attemptId }));
        setTimedOut(null);
        finished.current = false;
      }
      if (flashTimer.current !== null) {
        window.clearTimeout(flashTimer.current);
        flashTimer.current = null;
      }
      activeView.current = next;
      setChecked(null);
      setFlash(false);
      setError(null);
      setHolds({});
      setNudged(false);
      setShared({});
      if (next.current === null) {
        finished.current = true;
        clearDrafts({ lang, id, attemptId: next.attemptId });
        // Replaced, so Back from the results goes to the lesson page.
        router.replace(resultsPath);
        return;
      }
      sent.current = null;
      moved.current = true;
      setView(next);
      setReceivedAt(askedAt);
      top.current?.scrollIntoView({ block: 'start' });
    },
    [lang, id, router, resultsPath],
  );

  const hold = useCallback((key: string, value: Hold | null) => {
    setHolds((current) => {
      const before = current[key];
      if (before?.kind === value?.kind && before?.message === value?.message) return current;
      const next = { ...current };
      if (value === null) delete next[key];
      else next[key] = value;
      return next;
    });
  }, []);
  const share = useCallback((key: string, value: unknown) => {
    setShared((current) => (current[key] === value ? current : { ...current, [key]: value }));
  }, []);

  function answer(ref: Ref, value: Answer | undefined) {
    setDrafts((current) => {
      const next = { ...current };
      if (value === undefined) delete next[ref];
      else next[ref] = value;
      return next;
    });
  }

  /** A 409, or a failed post after the countdown: reads the attempt again and renders it. */
  async function reread(code: string, status: number) {
    const asked = Date.now();
    const result = await readAttempt(lang, id);
    if (!result.ok || result.data.attempt === null) {
      setError(errorMessage(result.ok ? code : result.code, result.ok ? status : result.status));
      return;
    }
    rememberAttempt(lang, id, result.data.attempt, asked);
    show(result.data.attempt, asked);
    setError(errorMessage(code, status));
  }

  /** Posts the page at the cursor; `afterZero` when its countdown ran out here. */
  async function post(afterZero = false) {
    if (!page || sent.current === page.index) return;
    sent.current = page.index;
    const refs = new Set(unitRefs(page));
    const answers = Object.fromEntries(
      Object.entries(drafts).filter(([ref]) => refs.has(ref)),
    ) as Record<Ref, Answer>;

    setPending(true);
    setError(null);
    const asked = Date.now();
    const result = await submitPage(lang, id, page.index, view.attemptId, answers);
    setPending(false);

    if (!result.ok) {
      sent.current = null;
      // After the countdown, the server may have closed the page already: its word counts.
      if (result.status === 409 || afterZero || timedOut === page.index) {
        return reread(result.code, result.status);
      }
      setError(errorMessage(result.code, result.status));
      return;
    }

    const { feedback, attempt } = result.data;
    rememberAttempt(lang, id, attempt, asked);
    // The page is locked on the server: its drafts are done with.
    const rest = Object.fromEntries(Object.entries(drafts).filter(([ref]) => !refs.has(ref)));
    saveDrafts(slot, rest);

    if (feedback === null || page.role !== 'practice') {
      setDrafts(rest);
      show(attempt, asked);
      return;
    }

    const byRef = new Map(feedback.map((f) => [f.ref, f]));
    setChecked({ feedback: byRef, next: attempt, at: asked });
    // Right at once on a page whose items all allow it: a green flash, then on.
    const allRight = feedback.every((f) => f.outcome === 'fully_correct');
    const skip = page.items.every((item) => lessons.player.typeSkipsFeedbackWhenRight(item.type));
    if (allRight && skip) {
      setFlash(true);
      flashTimer.current = window.setTimeout(() => {
        flashTimer.current = null;
        setDrafts(rest);
        show(attempt, asked);
      }, FLASH_MS);
    }
  }

  /** The countdown at zero: the page locks here, then its drafts go. */
  function zero() {
    if (page) setTimedOut(page.index);
    void post(true);
  }

  function next() {
    if (!checked) return;
    setDrafts((current) => {
      const refs = page ? new Set(unitRefs(page)) : new Set<string>();
      return Object.fromEntries(Object.entries(current).filter(([ref]) => !refs.has(ref)));
    });
    show(checked.next, checked.at);
  }

  if (page === null) {
    // On the way to the results.
    return null;
  }

  const exam = page.role === 'exam';
  const examPages = outline.pages.filter((p) => p.role === 'exam');
  const examCards =
    exam &&
    page.items.length > 1 &&
    page.items.reduce(
      (n, item) =>
        n +
        ('units' in item
          ? (item.units as { kind: string }[]).filter((u) => u.kind === 'text').length
          : 0),
      0,
    ) > 1;
  // No exam page after this one: Finish the exam.
  const lastExam = exam && !outline.pages.slice(page.index + 1).some((p) => p.role === 'exam');
  // Ran out while the learner was away: the page shows, locked, until Next.
  const ranOut = exam && view.remainingMs === 0;
  const locked = pending || checked !== null || ranOut || timedOut === page.index;

  const props = {
    lang,
    answers: drafts,
    onAnswer: answer,
    feedback: checked?.feedback ?? null,
    locked,
    hold,
    nudged,
    shared,
    share,
  };
  // Holds only stand before the page is sent: Continue after a Check is never held.
  const pageHolds = checked ? [] : Object.values(holds);
  const blocked = pageHolds.some((h) => h.kind === 'block');
  const nudging = pageHolds.some((h) => h.kind === 'nudge');
  const holdMessage = pageHolds.find((h) => h.message && (h.kind === 'block' || nudged))?.message;

  const button = (() => {
    if (checked) return { label: t('continue'), onClick: next };
    switch (page.role) {
      case 'practice':
        return { label: t('check'), onClick: () => void post() };
      case 'examIntro':
        return { label: t('startExam'), onClick: () => void post() };
      case 'exam':
        return { label: lastExam ? t('finishExam') : t('next'), onClick: () => void post() };
      default:
        return { label: t('continue'), onClick: () => void post() };
    }
  })();

  return (
    <div
      ref={top}
      data-page-index={page.index}
      data-page-role={page.role}
      // open, checked (the feedback shows, Continue next) or flash (on its own to the next page).
      data-state={flash ? 'flash' : checked ? 'checked' : 'open'}
      className="lesson-view"
    >
      <div className="lesson-layout">
        <LessonNavigation key={page.index} outline={outline} index={page.index} />
        <div className="lesson-main">
          <PlayerHeader
            outline={outline}
            index={page.index}
            // Checked: the header counts the page's points already.
            practice={checked?.next.practice ?? view.practice}
            exam={exam}
            pagePath={pagePath}
            showScore={page.items.some((item) => 'units' in item && item.units.length > 0)}
          />

          <section className="lesson-task" aria-labelledby="lesson-task-heading">
            <div className="lesson-task-top">
              <div>
                <p className="lesson-task-label">{pick(outline.pages[page.index]!.step, locale)}</p>
                <h1
                  id="lesson-task-heading"
                  ref={heading}
                  tabIndex={-1}
                  className="lesson-task-heading outline-none"
                >
                  {pick(page.instructions, locale)}
                </h1>
              </div>
              {exam && receivedAt !== null && view.remainingMs !== null ? (
                <ExamTimer
                  key={`${view.attemptId}:${page.index}`}
                  deadline={receivedAt + view.remainingMs}
                  ranOut={ranOut}
                  onZero={zero}
                  limitS={outline.pages[page.index]!.limitS ?? 1}
                />
              ) : null}
            </div>

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
                {/* Each exam page with its questions and countdown, as in the mockup. */}
                <ol className="flex flex-col gap-2" aria-label={t('exam')}>
                  {examPages.map((p, n) => (
                    <li
                      key={n}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 px-4 py-3"
                    >
                      <span className="font-medium text-slate-100">
                        {t('examPageTitle', { n: n + 1 })}
                      </span>
                      <span className="text-sm text-slate-400 tabular-nums">
                        {t('examPageDetail', { questions: p.questions, seconds: p.limitS ?? 0 })}
                      </span>
                    </li>
                  ))}
                </ol>
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

            {/* Keyed by page, so the items of a new page start afresh. */}
            <div key={page.index} className="lesson-items">
              {page.items.map((item, n) =>
                examCards ? (
                  // Exam pages with several typed answers: one numbered card per task, as in the mockup.
                  <div key={n} className="lesson-exam-card">
                    <span className="lesson-exam-card-number" aria-hidden="true">
                      {n + 1}.
                    </span>
                    <Item item={item} {...props} />
                  </div>
                ) : (
                  <Item key={n} item={item} {...props} />
                ),
              )}
            </div>

            <div className="lesson-task-footer flex flex-col gap-3">
              <FormError message={error} />
              <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-3">
                {holdMessage ? (
                  <p className="text-slate-400" data-hold-message>
                    {holdMessage}
                  </p>
                ) : null}
                <button
                  type="button"
                  // The second click of a double-click would land on the next
                  // page's Check (or Next) and send it blank: only single
                  // clicks count. A key press has detail 0.
                  onClick={(event) => {
                    if (event.detail > 1) return;
                    // A nudge lets the first press show its notes; the next one sends.
                    if (nudging && !nudged) {
                      setNudged(true);
                      return;
                    }
                    button.onClick();
                  }}
                  disabled={pending || flash || blocked}
                  className={PRIMARY_BUTTON}
                >
                  {button.label}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {flash ? (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-20 animate-lesson-flash bg-green-500/25"
        />
      ) : null}
      <p role="status" className="sr-only">
        {flash
          ? t('allRight')
          : checked
            ? t('checkedTally', {
                right: [...checked.feedback.values()].filter((f) => f.outcome === 'fully_correct')
                  .length,
                total: checked.feedback.size,
              })
            : ''}
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
  showScore,
}: {
  outline: LessonOutline;
  index: number;
  practice: AttemptView['practice'];
  exam: boolean;
  pagePath: string;
  showScore: boolean;
}) {
  const t = useTranslations('Lesson');
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => recordPlayerOrigin(pagePath), [pagePath]);
  function leave() {
    if (playerHasLessonOrigin(pagePath)) router.back();
    else router.replace(pagePath);
  }
  const hasExam = outline.pages.some((page) => page.role === 'exam' && page.questions > 0);
  const practiceWeight = hasExam ? lessons.player.POLICY.practiceWeight : 100;
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
    <div className="lesson-player-header">
      <p lang={outline.lessonId.split('-')[0]} className="lesson-session-title">
        {outline.title}
      </p>
      <div className="lesson-session-meters">
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
                leave();
              }}
            >
              {t('leaveConfirm')}
            </ConfirmDialog>
          </>
        ) : (
          <button type="button" onClick={leave} aria-label={t('leave')} className={closeClass}>
            {close}
          </button>
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
        <span className="lesson-progress-percent text-slate-400">{percent}%</span>
        {showScore ? (
          <p className="flex shrink-0 flex-wrap items-baseline justify-end gap-x-2 text-sm">
            {exam ? (
              <span className="rounded-full border border-amber-400/60 px-2 py-0.5 text-xs font-medium text-amber-200">
                {t('exam')}
              </span>
            ) : null}
            <span data-testid="header-score" className="font-semibold tabular-nums text-slate-100">
              {t('tally', {
                earned:
                  practice.possible === 0
                    ? 0
                    : Math.round((10 * practiceWeight * practice.earned) / practice.possible) / 10,
                possible: 100,
              })}
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
