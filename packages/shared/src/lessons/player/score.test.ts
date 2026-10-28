import { describe, expect, it } from 'vitest';

import { BY_KIND, fixtureLesson } from './fixtures.testing';
import { buildPlan, type PlanUnit } from './plan';
import {
  answerMarks,
  classifyAnswer,
  isAnswered,
  isPluralAnswer,
  lessonResults,
  normalizeAnswer,
  roundScore,
  scoreUnit,
  type UnitResponse,
} from './score';

/**
 * Ported from the lesson prototype's answer and session tests
 * (tests/unit/answers.test.ts, session.test.ts and plural.test.tsx at
 * c806f47), with the answers in the player's shapes ({ text }, { option }…).
 */

const accepted = (answers: string[]) => ({ answers });
const base = {
  id: 'p/i',
  itemId: 'i',
  prompt: {},
  explanation: { en: 'e', fr: 'e', de: 'e' },
  answer: '',
  answerLang: 'learning' as const,
};
const tokens = (texts: string[]) =>
  texts.map((text, n) => ({ id: `t${n}`, text, lang: 'learning' as const }));

describe('classifyAnswer', () => {
  it('tells full, accent or case only, incorrect and unanswered apart (the SPEC examples)', () => {
    const a = accepted(['un café']);
    expect(classifyAnswer('un café', a)).toMatchObject({ outcome: 'fully_correct', points: 1 });
    expect(classifyAnswer('un cafe', a)).toMatchObject({
      outcome: 'orthography_only',
      points: 0.5,
    });
    expect(classifyAnswer('Un café', a)).toMatchObject({
      outcome: 'orthography_only',
      points: 0.5,
    });
    expect(classifyAnswer('une café', a)).toMatchObject({ outcome: 'incorrect', points: 0 });
    expect(classifyAnswer('   ', a)).toMatchObject({ outcome: 'unanswered', points: 0 });
  });

  it('reports the accepted answer it matched', () => {
    expect(classifyAnswer(' un  cafe ', accepted(['un thé', 'un café']))).toEqual({
      outcome: 'orthography_only',
      points: 0.5,
      expected: 'un café',
    });
    expect(classifyAnswer('un stylo', accepted(['un crayon', 'un stylo'])).expected).toBe(
      'un stylo',
    );
  });

  it('normalizes spaces, no-break spaces and typographic apostrophes, but not accents or case', () => {
    expect(normalizeAnswer('  Ça va ?  ')).toBe('Ça va ?');
    expect(classifyAnswer('l’école', accepted(["l'école"])).outcome).toBe('fully_correct');
  });

  it('gives half a point for a ligature or umlaut spelled out', () => {
    for (const [given, answer] of [
      ['la soeur', 'la sœur'],
      ['ex aequo', 'ex æquo'],
      ['das Maedchen', 'das Mädchen'],
      ['das Madchen', 'das Mädchen'],
      ['schoen', 'schön'],
      ['fur', 'für'],
    ])
      expect(classifyAnswer(given, accepted([answer])).outcome).toBe('orthography_only');
  });

  it('gives half a point for an accent that makes another word: an accent is a spelling mistake', () => {
    expect(classifyAnswer('Il va a Paris.', accepted(['Il va à Paris.'])).outcome).toBe(
      'orthography_only',
    );
    expect(classifyAnswer('ou', accepted(['où'])).outcome).toBe('orthography_only');
  });

  it('gives nothing for other letters', () => {
    expect(classifyAnswer('livres', accepted(['livre'])).outcome).toBe('incorrect');
    expect(classifyAnswer('grand mère', accepted(['grand-mère'])).outcome).toBe('incorrect');
  });
});

describe('answerMarks', () => {
  it('marks only the letters whose accent or capital differs', () => {
    expect(answerMarks('un cafe', ['un café'])).toEqual([
      { text: 'un caf', wrong: false },
      { text: 'e', wrong: true },
    ]);
    expect(answerMarks('Un café', ['un café'])).toEqual([
      { text: 'U', wrong: true },
      { text: 'n café', wrong: false },
    ]);
  });

  it('marks only a wrong article', () => {
    expect(answerMarks('une café', ['un café'])).toEqual([
      { text: 'une', wrong: true },
      { text: ' café', wrong: false },
    ]);
    expect(answerMarks("l'école", ['une école'])).toEqual([
      { text: "l'", wrong: true },
      { text: 'école', wrong: false },
    ]);
  });

  it('keeps the learner’s own apostrophes', () => {
    const marks = answerMarks('L’addition, s’il vous plait', ['L’addition, s’il vous plaît']);
    expect(marks.map((m) => m.text).join('')).toBe('L’addition, s’il vous plait');
  });

  it('marks the whole answer otherwise', () => {
    expect(answerMarks('un thé', ['un café'])).toEqual([{ text: 'un thé', wrong: true }]);
    expect(answerMarks('café', ['un café'])).toEqual([{ text: 'café', wrong: true }]);
    expect(answerMarks('  ', ['un café'])).toEqual([{ text: '', wrong: true }]);
  });
});

describe('isAnswered and scoreUnit', () => {
  const text: PlanUnit = {
    ...base,
    kind: 'text',
    itemType: 'grammar_gap_typing',
    accepted: accepted(['suis']),
  };
  const choice: PlanUnit = {
    ...base,
    kind: 'choice',
    itemType: 'grammar_pronoun_form_match',
    // Two tokens with the same text are both right for the row (il est, elle est).
    options: tokens(['est', 'est', 'sont']),
    correct: ['t0', 't1'],
  };
  const order: PlanUnit = {
    ...base,
    kind: 'order',
    itemType: 'grammar_word_order',
    tokens: tokens(['nous', 'nous', 'lavons']),
    acceptedOrders: [
      ['t0', 't2', 't1'],
      ['t1', 't0', 't2'],
    ],
  };
  const reply: PlanUnit = { ...order, itemType: 'function_word_order', distractors: ['t1'] };
  const spot = (mode: 'type' | 'select'): PlanUnit => ({
    ...base,
    kind: 'spot',
    itemType: 'grammar_error_spotter',
    tokens: tokens(['je', 'es', 'là']),
    faultyTokenId: 't1',
    correction: {
      mode,
      accepted: accepted(['suis']),
      choices: mode === 'select' ? ['suis', 'est'] : [],
    },
  });

  it('enables Check only with an answer of the unit’s kind', () => {
    expect(isAnswered(text, { text: ' ' })).toBe(false);
    expect(isAnswered(text, { text: 'suis' })).toBe(true);
    expect(isAnswered(text, { option: 't0' })).toBe(false);
    expect(isAnswered(text, { token: 't1', text: 'suis' })).toBe(false);
    expect(isAnswered(text, null)).toBe(false);
    expect(isAnswered(choice, { option: '' })).toBe(false);
    expect(isAnswered(choice, { text: 't0' })).toBe(false);
    expect(isAnswered(order, { tokens: ['t0', 't2'] })).toBe(false);
    expect(isAnswered(order, { tokens: ['t0', 't2', 't1'] })).toBe(true);
    // An exam reply with distractors leaves some tokens in the bank.
    expect(isAnswered(reply, { tokens: ['t0'] })).toBe(true);
    expect(isAnswered(reply, { tokens: [] })).toBe(false);
    expect(isAnswered(spot('type'), { token: 't1', text: ' ' })).toBe(false);
    expect(isAnswered(spot('type'), { tokens: [] })).toBe(false);
  });

  it('scores a blank or a wrong kind as unanswered', () => {
    expect(scoreUnit(text, undefined)).toEqual({ outcome: 'unanswered', points: 0 });
    expect(scoreUnit(text, { option: 'suis' })).toEqual({ outcome: 'unanswered', points: 0 });
  });

  it('accepts duplicate form texts, alternative orders and repeated words', () => {
    expect(scoreUnit(choice, { option: 't1' }).points).toBe(1);
    expect(scoreUnit(choice, { option: 't2' }).points).toBe(0);
    expect(scoreUnit(order, { tokens: ['t1', 't2', 't0'] }).points).toBe(1); // the first order's sentence
    expect(scoreUnit(order, { tokens: ['t0', 't1', 't2'] }).points).toBe(1); // the second order
    expect(scoreUnit(order, { tokens: ['t2', 't0', 't1'] }).points).toBe(0);
  });

  it('scores an error spot: the right token, then the correction', () => {
    expect(scoreUnit(spot('type'), { token: 't0', text: 'suis' }).outcome).toBe('incorrect');
    expect(scoreUnit(spot('type'), { token: 't1', text: 'suis' }).points).toBe(1);
    expect(scoreUnit(spot('type'), { token: 't1', text: 'Suis' }).points).toBe(0.5);
    // A picked correction has no half point.
    expect(scoreUnit(spot('select'), { token: 't1', text: 'Suis' }).points).toBe(0);
    expect(scoreUnit(spot('select'), { token: 't1', text: 'suis' }).points).toBe(1);
  });

  it('counts a plural answer only for a plurale tantum, and then only with the right gender', () => {
    const noun = (pluraleTantum: boolean, answer: string): PlanUnit => ({
      ...base,
      kind: 'text',
      itemType: 'vocabulary_translation_exam',
      accepted: accepted([answer]),
      noun: { genders: ['masculine'], pluraleTantum },
    });
    const livre = noun(false, 'un livre');
    const ciseaux = noun(true, 'des ciseaux');
    expect(isPluralAnswer('des livres')).toBe(true);
    expect(isPluralAnswer('desserts')).toBe(false);
    expect(scoreUnit(livre, { text: 'des livres', gender: 'masculine' }).points).toBe(0);
    expect(scoreUnit(livre, { text: 'un livre' }).points).toBe(1);
    const tantum = (r: UnitResponse) => scoreUnit(ciseaux, r);
    expect(tantum({ text: 'des ciseaux', gender: 'masculine' })).toEqual({
      outcome: 'fully_correct',
      points: 1,
    });
    expect(tantum({ text: 'des ciseaux', gender: 'feminine' }).points).toBe(0);
    expect(tantum({ text: 'des ciseaux' }).points).toBe(0);
    expect(tantum({ text: 'Des ciseaux', gender: 'masculine' }).points).toBe(0.5);
    expect(tantum({ text: 'un ciseau', gender: 'masculine' }).points).toBe(0);
  });

  it('gives half a point for un cafe and nothing for une café on a real exam unit', () => {
    const plan = buildPlan(fixtureLesson(BY_KIND.vocabulary), 'en');
    const unit = plan.pages.find((p) => p.role === 'exam')!.units[0];
    expect(scoreUnit(unit, { text: 'un livre' })).toEqual({ outcome: 'fully_correct', points: 1 });
    expect(scoreUnit(unit, { text: 'un lívre' })).toEqual({
      outcome: 'orthography_only',
      points: 0.5,
    });
    expect(scoreUnit(unit, { text: 'une livre' })).toEqual({ outcome: 'incorrect', points: 0 });
  });
});

describe('lessonResults', () => {
  const plan = buildPlan(fixtureLesson(BY_KIND.grammar), 'en');
  const units = (role: 'practice' | 'exam') =>
    plan.pages.filter((p) => p.role === role).flatMap((p) => p.units);
  /** Locks the first `share` of each role's units with a point, the others with none. */
  const locked = (practice: number, exam: number) =>
    Object.fromEntries(
      (['practice', 'exam'] as const).flatMap((role) => {
        const list = units(role);
        const right = Math.round(list.length * (role === 'practice' ? practice : exam));
        return list.map((u, n) => [u.id, { points: n < right ? 1 : 0 }]);
      }),
    );

  it('weights practice 35 % and exam 65 %: 80 % and 60 % give 67', () => {
    // fr-negation-ne-pas: 25 practice units and 10 exam units.
    const negation = buildPlan(fixtureLesson('fr-negation-ne-pas'), 'en');
    const share = (role: 'practice' | 'exam', right: number) =>
      negation.pages
        .filter((p) => p.role === role)
        .flatMap((p) => p.units)
        .map((u, n) => [u.id, { points: n < right ? 1 : 0 }] as const);
    const results = lessonResults(
      negation,
      Object.fromEntries([...share('practice', 20), ...share('exam', 6)]),
    );
    expect(results.practice).toEqual({ earned: 20, possible: 25 });
    expect(results.exam).toEqual({ earned: 6, possible: 10 });
    expect(roundScore(results.total)).toBe(67);
  });

  it('shows one decimal: 78.25 is 78.3', () => {
    expect(roundScore(78.25)).toBe(78.3);
    expect(roundScore(67)).toBe(67);
  });

  it('counts a unit that is not locked as 0, and lists every scored step once', () => {
    const results = lessonResults(plan, {});
    expect(results.total).toBe(0);
    expect(results.steps.map((s) => [s.stepId, s.role, s.possible])).toEqual([
      ['ex-sg-choice', 'practice', 3],
      ['ex-sg-typing', 'practice', 3],
      ['ex-sg-spot', 'practice', 4],
      ['ex-pl-persons', 'practice', 6],
      ['ex-pl-typing', 'practice', 6],
      ['ex-pl-choice', 'practice', 4],
      ['ex-pl-gap', 'practice', 4],
      ['exam', 'exam', 12],
    ]);
  });

  it('counts the exam fully when the lesson has no practice units', () => {
    const exam = { ...plan, pages: plan.pages.filter((p) => p.role !== 'practice') };
    expect(lessonResults(exam, locked(0, 0.5)).total).toBe(50);
    const practice = { ...plan, pages: plan.pages.filter((p) => p.role !== 'exam') };
    expect(lessonResults(practice, locked(0.8, 0)).total).toBe(80);
  });

  it('splits a functions exam into its parts', () => {
    const functions = buildPlan(fixtureLesson(BY_KIND.functions), 'en');
    const exam = lessonResults(functions, {}).steps.filter((s) => s.role === 'exam');
    expect(exam.map((s) => [s.part, s.possible])).toEqual([
      ['translation', 4],
      ['replies', 4],
      ['dialogue', 4],
    ]);
  });
});
