import type { AcceptedAnswers } from '../schemas/artifactCommon';
import type { Gender } from '../schemas/vocabulary';
import { kindModule, type ExamPart } from './kinds';
import type { LessonPlan, PlanUnit } from './plan';

/**
 * Scoring: how one answer is classified, and how a lesson's answers add
 * up to its score. The same rules for every kind, in practice and in the
 * exam; the exam's outcomes only show in the results.
 *
 *   un café   → fully correct, 1 point
 *   un cafe   → an accent or a capital wrong: orthography only, ½ point
 *   une café  → incorrect, 0
 *   (blank)   → unanswered, 0
 *
 * score = 35 % × practice percentage + 65 % × exam percentage
 */

/** The weights of the score and the credit of an accent or case slip (every brief's `scoring`). */
export const POLICY = { practiceWeight: 35, examWeight: 65, orthographyCredit: 0.5 } as const;

export const ANSWER_OUTCOMES = [
  'fully_correct',
  'orthography_only',
  'incorrect',
  'unanswered',
] as const;
export type AnswerOutcome = (typeof ANSWER_OUTCOMES)[number];

/**
 * One answer of the learner, by unit kind, with internal ids. view.ts's
 * Answer has the same shapes with refs; the attempt core turns one into
 * the other.
 *
 *   text    { text: 'un livre' }             (gender: after "des" + a word)
 *   choice  { option: 'masculine' }
 *   order   { tokens: ['t1', 't3', 't2'] }
 *   spot    { token: 't2', text: 'suis' }
 */
export type UnitResponse =
  | { text: string; gender?: Gender }
  | { option: string }
  | { tokens: string[] }
  | { token: string; text: string };

/**
 * NFC; trims and collapses spaces, no-break and narrow no-break spaces
 * included; unifies the typographic apostrophes. Keeps case and accents.
 */
export function normalizeAnswer(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[‘’ʼ′`´]/g, "'")
    .replace(/[\s\u00a0\u202f\u2007]+/g, ' ')
    .trim();
}

const stripMarks = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');

/** Case and accents removed. */
const foldAccents = (s: string) => stripMarks(s.toLowerCase());

/** Also spells ligatures and umlauts as two letters: sœur ~ soeur, Mädchen ~ Maedchen. */
const foldDigraphs = (s: string) =>
  stripMarks(
    s
      .toLowerCase()
      .replace(/œ/g, 'oe')
      .replace(/æ/g, 'ae')
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue'),
  );

export interface Classification {
  outcome: AnswerOutcome;
  points: 0 | 0.5 | 1;
  /** The accepted answer the response matched or came closest to; the first one otherwise. */
  expected: string;
}

/** Classifies a typed answer against the accepted answers. */
export function classifyAnswer(response: string, accepted: AcceptedAnswers): Classification {
  const r = normalizeAnswer(response);
  const answers = accepted.answers.map(normalizeAnswer);
  const expected = accepted.answers[0];
  if (r === '') return { outcome: 'unanswered', points: 0, expected };

  const exact = answers.findIndex((a) => a === r);
  if (exact >= 0) return { outcome: 'fully_correct', points: 1, expected: accepted.answers[exact] };

  // An accent is a spelling mistake, also where it makes another word (la, là): half a point.
  const close = answers.findIndex(
    (a) => foldAccents(a) === foldAccents(r) || foldDigraphs(a) === foldDigraphs(r),
  );
  if (close >= 0)
    return { outcome: 'orthography_only', points: 0.5, expected: accepted.answers[close] };
  return { outcome: 'incorrect', points: 0, expected };
}

/** A part of a learner's answer in the results; the `wrong` parts are shown in red. */
export interface AnswerMark {
  text: string;
  wrong: boolean;
}

const ARTICLES = new Set(['un', 'une', 'des', 'le', 'la', 'les', "l'", 'du', 'de', "d'"]);
const plainLetter = (c: string) => c.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Marks what is wrong in a typed answer, compared with the accepted
 * answers: only the letters when only accents or capitals differ, only
 * the article when only the article differs, otherwise the whole answer.
 */
export function answerMarks(response: string, accepted: string[]): AnswerMark[] {
  const marks = compareMarks(response, accepted);
  // Show the learner's own characters (typographic apostrophes) where the lengths still match.
  const raw = [...response.normalize('NFC').trim()];
  if (raw.length !== marks.reduce((n, m) => n + [...m.text].length, 0)) return marks;
  let at = 0;
  return marks.map((m) => {
    const len = [...m.text].length;
    const text = raw.slice(at, at + len).join('');
    at += len;
    return { ...m, text };
  });
}

function compareMarks(response: string, accepted: string[]): AnswerMark[] {
  const given = normalizeAnswer(response);
  const whole = [{ text: given, wrong: true }];
  if (!given) return whole;
  const answers = accepted.map(normalizeAnswer);
  const letters = [...given];
  // Accents or capitals only: compare letter by letter.
  const same = answers.find(
    (a) =>
      [...a].length === letters.length &&
      [...a].every((c, n) => plainLetter(c) === plainLetter(letters[n])),
  );
  if (same) {
    const target = [...same];
    const marks: AnswerMark[] = [];
    for (const [n, c] of letters.entries()) {
      const wrong = c !== target[n];
      const last = marks.at(-1);
      if (last && last.wrong === wrong) last.text += c;
      else marks.push({ text: c, wrong });
    }
    return marks;
  }
  // The article only: the same words after another article.
  const split = (s: string) => {
    const m = /^(l'|d'|\S+)(?:\s+|(?<=')(?=\S))(.*)$/u.exec(s);
    return m && ARTICLES.has(m[1].toLowerCase()) ? { article: m[1], rest: m[2] } : undefined;
  };
  const mine = split(given);
  if (
    mine &&
    answers.some((a) => {
      const theirs = split(a);
      return (
        theirs?.rest === mine.rest && theirs.article.toLowerCase() !== mine.article.toLowerCase()
      );
    })
  ) {
    const gap = given.slice(mine.article.length, given.length - mine.rest.length);
    return [
      { text: mine.article, wrong: true },
      { text: gap + mine.rest, wrong: false },
    ];
  }
  return whole;
}

/** A typed answer that starts with "des" and a word: then the player asks for the gender. */
export function isPluralAnswer(text: string): boolean {
  return /^des\s+\S/iu.test(text.trim());
}

/**
 * true when the unit has an answer: it enables Check. A response of
 * another unit kind is no answer. A word order uses every token, except
 * an exam reply with distractors, which needs at least one.
 */
export function isAnswered(unit: PlanUnit, response: UnitResponse | null | undefined): boolean {
  if (!response) return false;
  switch (unit.kind) {
    case 'text':
      return 'text' in response && !('token' in response) && normalizeAnswer(response.text) !== '';
    case 'choice':
      return 'option' in response && response.option !== '';
    case 'order':
      return (
        'tokens' in response &&
        (unit.distractors?.length
          ? response.tokens.length > 0
          : response.tokens.length === unit.tokens.length)
      );
    case 'spot':
      return 'token' in response && !!response.token && normalizeAnswer(response.text) !== '';
  }
}

/** The score of one unit's first answer: 1, 0.5 (a typed answer with a spelling slip) or 0. */
export function scoreUnit(
  unit: PlanUnit,
  response: UnitResponse | null | undefined,
): { outcome: AnswerOutcome; points: 0 | 0.5 | 1 } {
  if (!response || !isAnswered(unit, response)) return { outcome: 'unanswered', points: 0 };
  const right = (ok: boolean) =>
    ok ? { outcome: 'fully_correct' as const, points: 1 as const } : INCORRECT;
  switch (unit.kind) {
    case 'text': {
      const r = response as { text: string; gender?: Gender };
      const c = classifyAnswer(r.text, unit.accepted);
      // A plurale tantum answered with "des" counts only with a right gender.
      if (
        c.outcome !== 'incorrect' &&
        unit.noun?.pluraleTantum &&
        isPluralAnswer(r.text) &&
        !(r.gender && unit.noun.genders.includes(r.gender))
      )
        return INCORRECT;
      return { outcome: c.outcome, points: c.points };
    }
    case 'choice':
      return right(unit.correct.includes((response as { option: string }).option));
    case 'order': {
      const order = (response as { tokens: string[] }).tokens;
      const text = (ids: string[]) =>
        ids.map((id) => unit.tokens.find((t) => t.id === id)?.text).join(' ');
      // A repeated word has two tokens: compare the sentences, not the token ids.
      return right(unit.acceptedOrders.some((o) => text(o) === text(order)));
    }
    case 'spot': {
      const r = response as { token: string; text: string };
      if (r.token !== unit.faultyTokenId) return INCORRECT;
      const c = classifyAnswer(r.text, unit.correction.accepted);
      // A picked correction is right or wrong; a typed one may have a spelling slip.
      return unit.correction.mode === 'select'
        ? right(c.outcome === 'fully_correct')
        : { outcome: c.outcome, points: c.points };
    }
  }
}

const INCORRECT = { outcome: 'incorrect' as const, points: 0 as const };

/** Points earned out of points possible: one point per unit. */
export interface Tally {
  earned: number;
  possible: number;
}

/** The points of each locked unit, by unit id. */
export type LockedPoints = Record<string, { points: number } | undefined>;

export const percent = (t: Tally) => (t.possible ? (100 * t.earned) / t.possible : 0);

function tally(units: PlanUnit[], locked: LockedPoints): Tally {
  return {
    earned: units.reduce((s, u) => s + (locked[u.id]?.points ?? 0), 0),
    possible: units.length,
  };
}

/** One scored step in the results; an exam a kind splits gives one step per part. */
export interface StepTally extends Tally {
  stepId: string;
  role: 'practice' | 'exam';
  part?: ExamPart;
  /** Indexes of the step's pages in the plan. */
  pages: number[];
}

export interface LessonResults {
  practice: Tally;
  exam: Tally;
  /**
   * 35 % of the practice percentage plus 65 % of the exam one; a lesson
   * with no practice (or no exam) units counts the other fully. Not
   * rounded: see roundScore.
   */
  total: number;
  steps: StepTally[];
}

/**
 * The score of a lesson from the points of its locked units. A unit not
 * locked counts 0, so the score of an unfinished attempt only grows.
 */
export function lessonResults(plan: LessonPlan, locked: LockedPoints): LessonResults {
  const units = (role: 'practice' | 'exam') =>
    plan.pages.filter((p) => p.role === role).flatMap((p) => p.units);
  const practice = tally(units('practice'), locked);
  const exam = tally(units('exam'), locked);
  const total =
    practice.possible && exam.possible
      ? (POLICY.practiceWeight * percent(practice) + POLICY.examWeight * percent(exam)) / 100
      : practice.possible
        ? percent(practice)
        : percent(exam);

  const kind = kindModule(plan.kind);
  const steps: StepTally[] = [];
  plan.pages.forEach((page, index) => {
    if (page.role !== 'practice' && page.role !== 'exam') return;
    const part = page.role === 'exam' ? kind.examPart(page) : undefined;
    let step = steps.find((s) => s.stepId === page.stepId && s.part === part);
    if (!step) {
      step = {
        stepId: page.stepId,
        role: page.role,
        ...(part ? { part } : {}),
        earned: 0,
        possible: 0,
        pages: [],
      };
      steps.push(step);
    }
    const t = tally(page.units, locked);
    step.earned += t.earned;
    step.possible += t.possible;
    step.pages.push(index);
  });
  return { practice, exam, total, steps };
}

/** The score as the results show it, with one decimal: 78.25 → 78.3. LessonResult stores Math.round. */
export const roundScore = (total: number) => Math.round((total + Number.EPSILON) * 10) / 10;
