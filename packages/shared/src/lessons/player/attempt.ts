import { PLAYER_COPY } from './copy';
import { answerGender, answerText, closest, unitFeedback, type LockedAnswer } from './feedback';
import type { LessonPlan, PlanPage, PlanUnit } from './plan';
import { pageView, paths, type RefOf } from './redact';
import { lessonResults, roundScore, scoreUnit, type UnitResponse } from './score';
import type { Answer, AttemptView, Ref, Results, UnitFeedback } from './view';

/**
 * The attempt core: one learner going through one lesson, forward only.
 * The API (#145) stores the state, rebuilds the plan on every request,
 * and calls these functions inside its transaction. They are pure: the
 * time comes in as `now` (milliseconds), so tests use a fake clock.
 *
 *   start ──► submit page 0 ──► submit page 1 ──► … ──► submit the last page
 *             (practice: feedback)  (exam: timed)        (closes the attempt)
 *
 * - Only the page at the cursor is accepted, once. Its units are scored
 *   (a blank one as 0) and locked; a locked unit never changes.
 * - When the cursor reaches an exam page, its deadline is set: now plus
 *   its countdown. A page that comes in after the deadline plus
 *   GRACE_MS counts every unit blank and Out of time.
 * - The last page closes the attempt; results() is then the snapshot the
 *   results page shows.
 */

/** Network grace after an exam deadline, as placement's NETWORK_GRACE_S. */
export const GRACE_MS = 2000;

/** What the API stores of an attempt, besides its id, its secret and its mother tongue. */
export interface AttemptState {
  /** The cursor: the index of the page the learner is on. */
  page: number;
  /** The deadline of the exam page at the cursor, in ms; null elsewhere. */
  deadline: number | null;
  /** The locked answers, by unit id. */
  answers: Record<string, LockedAnswer>;
  /** When the last page locked; null while the attempt runs. */
  completedAt: number | null;
}

/** A new attempt, on the first page. */
export function start(plan: LessonPlan, now: number): AttemptState {
  return enter(plan, { page: 0, deadline: null, answers: {}, completedAt: null }, 0, now);
}

/** Moves the cursor to `index`; an exam page gets its deadline. */
function enter(plan: LessonPlan, state: AttemptState, index: number, now: number): AttemptState {
  const page = plan.pages[index];
  const deadline = page?.role === 'exam' && page.timeLimitS ? now + page.timeLimitS * 1000 : null;
  return { ...state, page: index, deadline };
}

/** The header score: practice points so far, out of every practice unit. The exam never moves it. */
function practiceTally(plan: LessonPlan, state: AttemptState) {
  const units = plan.pages.filter((p) => p.role === 'practice').flatMap((p) => p.units);
  return {
    earned: units.reduce((s, u) => s + (state.answers[u.id]?.points ?? 0), 0),
    possible: units.length,
  };
}

/**
 * The attempt as the learner sees it. `results` is what the API stored
 * when the attempt closed (results() plus the finish block); null before.
 */
export function view(
  plan: LessonPlan,
  state: AttemptState,
  attemptId: string,
  ref: RefOf,
  now: number,
  results: Results | null = null,
): AttemptView {
  const done = state.completedAt !== null;
  return {
    attemptId,
    current: done ? null : pageView(plan, state.page, ref),
    remainingMs: !done && state.deadline !== null ? Math.max(0, state.deadline - now) : null,
    practice: practiceTally(plan, state),
    results: done ? results : null,
  };
}

/** Why a submit is refused: another page or a finished attempt (409), or an answer it cannot read (400). */
export type SubmitError = 'stale' | 'invalidAnswer';

export type SubmitResult =
  | {
      ok: true;
      state: AttemptState;
      /** The page's feedback on a practice page; null elsewhere. */
      feedback: UnitFeedback[] | null;
      /** This submit locked the last page. */
      closed: boolean;
    }
  | { ok: false; error: SubmitError };

/**
 * Turns the answers of a page, keyed by unit ref, into responses keyed
 * by unit id. An unknown ref (a unit, option or token of another page or
 * attempt) or an answer of the wrong kind refuses the whole page.
 */
export function readAnswers(
  page: PlanPage,
  answers: Record<Ref, Answer>,
  ref: RefOf,
): Record<string, UnitResponse> | null {
  const byRef = new Map(page.units.map((u) => [ref(paths.unit(u)), u]));
  const out: Record<string, UnitResponse> = {};
  for (const [key, answer] of Object.entries(answers)) {
    const unit = byRef.get(key);
    const response = unit && readAnswer(page, unit, answer, ref);
    if (!unit || !response) return null;
    out[unit.id] = response;
  }
  return out;
}

function readAnswer(
  page: PlanPage,
  unit: PlanUnit,
  answer: Answer,
  ref: RefOf,
): UnitResponse | null {
  const idOf = (list: { id: string }[], path: (id: string) => string, r: Ref) =>
    list.find((x) => ref(path(x.id)) === r)?.id;
  const option = (id: string) => paths.option(page, unit.itemId, id);
  const token = (id: string) => paths.token(page, unit.itemId, id);
  switch (unit.kind) {
    case 'text':
      if (!('text' in answer) || 'token' in answer) return null;
      return answer.gender ? { text: answer.text, gender: answer.gender } : { text: answer.text };
    case 'choice': {
      if (!('option' in answer)) return null;
      const id = idOf(unit.options, option, answer.option);
      return id === undefined ? null : { option: id };
    }
    case 'order': {
      if (!('tokens' in answer)) return null;
      const ids = answer.tokens.map((t) => idOf(unit.tokens, token, t));
      // Every token known, none twice.
      if (ids.some((id) => id === undefined) || new Set(ids).size !== ids.length) return null;
      return { tokens: ids as string[] };
    }
    case 'spot': {
      if (!('token' in answer)) return null;
      const id = idOf(unit.tokens, token, answer.token);
      return id === undefined ? null : { token: id, text: answer.text };
    }
  }
}

/**
 * Submits the page at `index`. Only the cursor page of a running attempt
 * is taken; every unit of it is scored and locked, then the cursor moves
 * on, and the last page closes the attempt.
 */
export function submit(
  plan: LessonPlan,
  state: AttemptState,
  index: number,
  answers: Record<Ref, Answer>,
  now: number,
  ref: RefOf,
): SubmitResult {
  if (state.completedAt !== null || index !== state.page) return { ok: false, error: 'stale' };
  const page = plan.pages[index];
  // A late exam page locks blank whatever it holds, so its answers are not even read.
  const late = page.role === 'exam' && state.deadline !== null && now > state.deadline + GRACE_MS;
  const responses = late ? {} : readAnswers(page, answers, ref);
  if (!responses) return { ok: false, error: 'invalidAnswer' };

  const locked = { ...state.answers };
  for (const unit of page.units) {
    if (locked[unit.id]) continue;
    const response = responses[unit.id] ?? null;
    locked[unit.id] = { response, ...scoreUnit(unit, response), timedOut: late };
  }
  const feedback =
    page.role === 'practice'
      ? page.units.map((u) => unitFeedback(page, u, locked[u.id], ref))
      : null;

  const last = index + 1 >= plan.pages.length;
  const next: AttemptState = last
    ? { ...state, answers: locked, deadline: null, completedAt: now }
    : enter(plan, { ...state, answers: locked }, index + 1, now);
  return { ok: true, state: next, feedback, closed: last };
}

/** The results of a finished attempt, without the finish block (the API adds it). */
export type ResultsSheet = Omit<Results, 'finish'>;

/**
 * The results page: the score, practice and exam, every scored step
 * (an exam a kind splits, by part), and every unit with the learner's
 * answer, the right one, its points and its explanation in en, fr and de.
 */
export function results(plan: LessonPlan, state: AttemptState): ResultsSheet {
  const score = lessonResults(plan, state.answers);
  const steps = score.steps.map((s) => ({
    title: s.part ? PLAYER_COPY.parts[s.part] : plan.pages[s.pages[0]].stepLabel,
    role: s.role,
    ...(s.part ? { part: s.part } : {}),
    scored: true,
    earned: s.earned,
    possible: s.possible,
  }));
  const rows = score.steps.flatMap((s, step) =>
    s.pages.flatMap((index) =>
      plan.pages[index].units.map((unit) => {
        const locked: LockedAnswer = state.answers[unit.id] ?? {
          response: null,
          outcome: 'unanswered',
          points: 0,
          timedOut: false,
        };
        const gender = answerGender(locked.response);
        return {
          step,
          prompt: { ...unit.prompt },
          yours: answerText(unit, locked.response),
          ...(gender ? { gender } : {}),
          answer: unit.answer,
          ...closest(unit, locked),
          outcome: locked.outcome,
          points: locked.points,
          scored: true,
          timedOut: locked.timedOut,
          explanation: unit.explanation,
        };
      }),
    ),
  );
  return {
    score: roundScore(score.total),
    practice: score.practice,
    exam: score.exam,
    steps,
    rows,
  };
}
