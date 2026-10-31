/**
 * The lesson player's domain: the pure TypeScript a lesson attempt runs
 * on. No React, no DOM, no node:crypto: the API runs it to score, and
 * the web app reads its view shapes.
 *
 *   plan.ts     the lesson as pages of answer units (buildPlan)
 *   kinds/      what each lesson kind does differently
 *   score.ts    how an answer and a lesson are scored
 *   outline.ts  the start page and the sidebar (lessonOutline)
 *   view.ts     the strict shapes of everything the browser may see
 *   redact.ts   the page views: a page without its keys
 *   attempt.ts  start, submit, view and results of one attempt
 *
 * Exported from @ft/shared as `lessons.player`.
 */
export { articleHint, startsWithArticle } from './articleHint';
export {
  GRACE_MS,
  readAnswers,
  results,
  start,
  submit,
  view,
  type AttemptState,
  type ResultsSheet,
  type SubmitError,
  type SubmitResult,
} from './attempt';
export { PLAYER_COPY } from './copy';
export { requiredReveals, skipsFeedbackWhenRight, type ExamPart } from './kinds';
export { motherTongue } from './motherTongue';
export { answerText, unitFeedback, type LockedAnswer } from './feedback';
export { lessonOutline } from './outline';
export {
  buildPlan,
  isScored,
  type Item,
  type LessonPlan,
  type LessonSource,
  type PageRole,
  type PlanPage,
  type PlanUnit,
} from './plan';
export { pageView, paths, type RefOf } from './redact';
export {
  ANSWER_OUTCOMES,
  POLICY,
  answerMarks,
  classifyAnswer,
  isAnswered,
  isPluralAnswer,
  lessonResults,
  normalizeAnswer,
  percent,
  roundScore,
  storedScore,
  scoreUnit,
  type AnswerMark,
  type AnswerOutcome,
  type LessonResults,
  type Tally,
  type UnitResponse,
} from './score';
export * from './view';
