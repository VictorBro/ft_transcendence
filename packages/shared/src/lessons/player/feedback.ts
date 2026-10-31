import type { Gender } from '../schemas/vocabulary';
import { isScored, type PlanPage, type PlanUnit } from './plan';
import { paths, type RefOf } from './redact';
import {
  answerMarks,
  classifyAnswer,
  type AnswerMark,
  type AnswerOutcome,
  type UnitResponse,
} from './score';
import type { UnitFeedback } from './view';

/**
 * The correction of one locked unit, with its keys: the feedback of a
 * practice page, and the rows of the results. Only a unit that is locked
 * gets one, so a key never goes out before its answer is final.
 */

/** A unit's answer once locked: what was sent and what it scored. Stored by the API, by unit id. */
export interface LockedAnswer {
  response: UnitResponse | null;
  outcome: AnswerOutcome;
  points: 0 | 0.5 | 1;
  /** An exam page that came in after its deadline: every unit blank and Out of time. */
  timedOut: boolean;
}

/** The learner's answer as text, for the results; null when blank. */
export function answerText(unit: PlanUnit, response: UnitResponse | null): string | null {
  if (!response) return null;
  const text = (id: string, list: { id: string; text: string }[]) =>
    list.find((o) => o.id === id)?.text ?? '';
  if (unit.kind === 'text' && 'text' in response) return response.text.trim() || null;
  if (unit.kind === 'choice' && 'option' in response) return text(response.option, unit.options);
  if (unit.kind === 'order' && 'tokens' in response)
    return response.tokens.map((id) => text(id, unit.tokens)).join(' ') || null;
  if (unit.kind === 'spot' && 'token' in response)
    return `${text(response.token, unit.tokens)} → ${response.text.trim()}`;
  return null;
}

/** The gender sent with a plural answer. */
export const answerGender = (response: UnitResponse | null): Gender | undefined =>
  response && 'gender' in response ? response.gender : undefined;

/** The typed text a unit's answer and keys compare: the answer, or a spot's correction. */
function typed(unit: PlanUnit, response: UnitResponse | null) {
  if (unit.kind === 'text' && response && 'text' in response)
    return { text: response.text, accepted: unit.accepted };
  if (
    unit.kind === 'spot' &&
    response &&
    'token' in response &&
    response.token === unit.faultyTokenId
  )
    return { text: response.text, accepted: unit.correction.accepted };
  return undefined;
}

/**
 * The accepted answer closest to the learner's, when it differs from the
 * teaching answer, and the marks of a typed answer that is not right.
 */
export function closest(
  unit: PlanUnit,
  locked: LockedAnswer,
): { accepted?: string; marks?: AnswerMark[] } {
  const t = typed(unit, locked.response);
  if (!t || locked.outcome === 'unanswered') return {};
  const { expected } = classifyAnswer(t.text, t.accepted);
  const accepted = unit.kind === 'text' && expected !== unit.answer ? { accepted: expected } : {};
  const marks =
    locked.outcome === 'fully_correct' ? {} : { marks: answerMarks(t.text, t.accepted.answers) };
  return { ...accepted, ...marks };
}

/** The feedback of one locked unit of `page`. */
export function unitFeedback(
  page: PlanPage,
  unit: PlanUnit,
  locked: LockedAnswer,
  ref: RefOf,
): UnitFeedback {
  const option = (id: string) => ref(paths.option(page, unit.itemId, id));
  const token = (id: string) => ref(paths.token(page, unit.itemId, id));
  return {
    ref: ref(paths.unit(unit)),
    outcome: locked.outcome,
    points: locked.points,
    scored: isScored(page),
    answer: unit.answer,
    explanation: unit.explanation,
    ...closest(unit, locked),
    ...(unit.kind === 'choice' ? { correct: unit.correct.map(option) } : {}),
    ...(unit.kind === 'order' ? { order: unit.acceptedOrders[0].map(token) } : {}),
    ...(unit.kind === 'spot' ? { faulty: token(unit.faultyTokenId) } : {}),
    ...(unit.form ? { form: unit.form } : {}),
    ...(unit.translation ? { translation: unit.translation } : {}),
  };
}
